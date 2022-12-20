import FormData from 'form-data';
import { NextApiRequest, NextApiResponse } from 'next';
import { serializeDictionary } from 'structured-headers';
import { createRouter } from 'next-connect';

import {
  convertSHA256HashToUUID,
  convertToDictionaryItemsRepresentation,
  generateUpdatesPath,
  getAppUpdatesPath,
  getAssetMetadataSync,
  getExpoConfigSync,
  getMetadataSync,
  getPrivateKeyAsync,
  RootProjectPath,
  signRSASHA256,
} from '../../common/helpers';
import { TUpdateRequestParams } from '../../types/types';
import { parseMultipartMixedResponseAsync } from '@expo/multipart-body-parser';

import multiparty from 'multiparty';
import { Nextable } from 'next-connect/dist/types/types';
import { RequestHandler } from 'next-connect/dist/types/node';
import fs from 'fs';

const router = createRouter<NextApiRequest, NextApiResponse>();

const fieldParserMiddleware: Nextable<RequestHandler<NextApiRequest, NextApiResponse>> = async (
  req,
  res,
  next
) => {
  const form = new multiparty.Form();
  await form.parse(req, function (err, fields, files) {
    if (err) {
      return res.status(500).json({
        message: err.message,
        error: 'Failed in parsing form request',
      });
    }
    for (const [key, value] of Object.entries(fields)) {
      fields[key] = (value && value[0])?.replace(/'|\s/g, '');
    }
    req.body = { fields, files, updatePath: `${RootProjectPath}/${generateUpdatesPath(fields)}` };
    next();
  });
};

const directoryCreatorMiddleware: Nextable<
  RequestHandler<NextApiRequest, NextApiResponse>
> = async (req, res, next) => {
  const { files, updatePath } = req.body;
  const promises = [];
  try {
    for (const fileDirectory of Object.keys(files)) {
      promises.push(fs.promises.mkdir(`${updatePath}${fileDirectory}`, { recursive: true }));
    }
    await Promise.all(promises);
  } catch (e) {
    console.log('Failed to create directories for update files', e);
  }
  next();
};

const filesUploaderMiddleware: Nextable<RequestHandler<NextApiRequest, NextApiResponse>> = async (
  req,
  res,
  next
) => {
  const { files, updatePath } = req.body;
  try {
    const promises = [];
    for (const file of Object.values(files).flat()) {
      // 'rename' from fs is used to move a file, to avoid having unnecessary files in temp
      promises.push(
        fs.promises.rename(file?.path, `${updatePath}${file?.fieldName}${file?.originalFilename}`)
      );
    }
    await Promise.all(promises);
  } catch (e) {
    console.log('failed to copy files', e);
  }
  next();
};

router.use(fieldParserMiddleware);
router.use(directoryCreatorMiddleware);
router.use(filesUploaderMiddleware);

/**
 TODO:
 For each update folder, there should be 2 new entries
 - .lock folder (contains id's or UUID generated for each requested update to be downloaded on a device, the file is deleted once the update is successfully downloaded)
 - .updateLock file: created first file when uploading new updates, prevents downloading of future updates

 On Uploading an update:
 - New Update (for current release channel, native version, or platform ..)
   - Should create the .updateLock file first thing, before the upload, to prevent fetching updates
   - Once Upload is done, create a .lock folder, delete .updateLock file to enable the update
 - Update for existing configuration
  - Check for existing directory, check files in .lock folder
  - Create .updateLock file
  - Create a new folder with timestamp (to be saved temp), and add the new upload there, include .updateLock file in new folder.
  - create a file watcher, or interval watcher for empty .lock folder, once it's empty, delete the old folder, and rename the new uploaded folder
 to the correct update path,
  - after renaming, should remove the .updateLock file to activate the new update.
  - For the downloading updates API, should add checking for .updateLock file existence before providing the update
 */
router.post(async (req: NextApiRequest, res: NextApiResponse) => {
  // May include more logic here
  res.json(req.body);
});

export default router.handler({
  onError: (err, req, res) => {
    console.error(err?.stack);
    res.status(500).end('Something broke!');
  },
  onNoMatch: (req, res) => {
    res.status(404).end('Page is not found');
  },
});

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

