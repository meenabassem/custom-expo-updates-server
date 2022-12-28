import { NextApiRequest, NextApiResponse } from 'next';
import { createRouter } from 'next-connect';

import { generateUpdatesPath, RootProjectPath } from '../../common/helpers';

import multiparty from 'multiparty';
import { Nextable } from 'next-connect/dist/types/types';
import { RequestHandler } from 'next-connect/dist/types/node';
import fs from 'fs';
import { DOWNLOAD_UPDATES_LOCK_FOLDER, UPLOAD_UPDATES_LOCK_FILE } from './consts';

interface NextApiPublishUpdateRequest extends NextApiRequest {
  body: {
    fields?: {
      name?: string;
      packageName?: string;
      platform?: string;
      runtimeVersion?: string;
      jsVersion?: string;
      releaseChannel?: string;
    }[];
    files?: {
      [x: string]: {
        fieldName?: string;
        originalFilename?: string;
        path?: string;
        size?: number;
        headers?: {
          [x: string]: string;
        };
      }[];
    };
    updatePath?: string;
    tempUpdatesPath?: string;
  };
}

const router = createRouter<NextApiPublishUpdateRequest, NextApiResponse>();

const fieldParserMiddleware: Nextable<
  RequestHandler<NextApiPublishUpdateRequest, NextApiResponse>
> = async (req, res, next) => {
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
    const updatePath = `${RootProjectPath}/${generateUpdatesPath(fields)}`;
    const tempUpdatesPath = `${updatePath}-temp`;
    req.body = { fields, files, updatePath, tempUpdatesPath };
    next();
  });
};

const updateLockFileCreatorMiddleware: Nextable<
  RequestHandler<NextApiPublishUpdateRequest, NextApiResponse>
> = async (req, res, next) => {
  const { updatePath, tempUpdatesPath } = req.body;
  const promises = [];

  if (fs.existsSync(updatePath)) {
    promises.push(fs.promises.writeFile(`${updatePath}/${UPLOAD_UPDATES_LOCK_FILE}`, ''));
  }
  promises.push(fs.promises.writeFile(`${tempUpdatesPath}/${UPLOAD_UPDATES_LOCK_FILE}`, ''));

  for (const promise of promises) {
    try {
      await promise;
    } catch (e) {
      console.log('Failed in promise in updateLockFileCreatorMiddleware', e);
    }
  }
  req.body = {
    ...req.body,
    tempUpdatesPath,
  };
  next();
};

const directoryCreatorMiddleware: Nextable<
  RequestHandler<NextApiPublishUpdateRequest, NextApiResponse>
> = async (req, res, next) => {
  const { files, tempUpdatesPath } = req.body;
  const promises = [];
  if (fs.existsSync(tempUpdatesPath)) {
    fs.rmSync(tempUpdatesPath, { recursive: true });
  }
  promises.push(
    fs.promises.mkdir(`${tempUpdatesPath}/${DOWNLOAD_UPDATES_LOCK_FOLDER}`, { recursive: true })
  );
  try {
    for (const fileDirectory of Object.keys(files)) {
      promises.push(fs.promises.mkdir(`${tempUpdatesPath}${fileDirectory}`, { recursive: true }));
    }

    await Promise.all(promises);
  } catch (e) {
    console.log('Failed to create directories for update files', e);
  }
  next();
};

const filesUploaderMiddleware: Nextable<
  RequestHandler<NextApiPublishUpdateRequest, NextApiResponse>
> = async (req, res, next) => {
  const { files, tempUpdatesPath } = req.body;
  try {
    const promises = [];
    for (const file of Object.values(files).flat()) {
      // 'rename' from fs is used to move a file, to avoid having unnecessary files in temp
      promises.push(
        fs.promises.rename(
          file?.path,
          `${tempUpdatesPath}${file?.fieldName}${file?.originalFilename}`
        )
      );
    }
    await Promise.all(promises);
  } catch (e) {
    console.log('failed to copy files', e);
  }
  next();
};
const moveFilesFromTempDirectoryMiddleware: Nextable<
  RequestHandler<NextApiPublishUpdateRequest, NextApiResponse>
> = async (req, res, next) => {
  const { updatePath, tempUpdatesPath, files } = req.body;
  try {
    const moveUpdateFolder = () => {
      try {
        if (fs.existsSync(updatePath)) {
          fs.rmSync(updatePath, { recursive: true });
        }
        fs.renameSync(tempUpdatesPath, updatePath);
      } catch (e) {
        console.log(`Failed to move update folder ${updatePath}`, e);
      }
    };
    if (!fs.existsSync(tempUpdatesPath)) {
      console.error('Updates temp update folder not found !!', tempUpdatesPath);
    }
    if (!fs.existsSync(updatePath)) {
      moveUpdateFolder();
    } else {
      const lockFolderPath = `${updatePath}/${DOWNLOAD_UPDATES_LOCK_FOLDER}`;
      if (fs.existsSync(lockFolderPath)) {
        const lockFiles = fs.readdirSync(lockFolderPath);
        if (lockFiles?.length === 0) {
          moveUpdateFolder();
        } else {
          await (async function () {
            return new Promise((resolve) => {
              const interval = setInterval(() => {
                const handleClearLockFolder = () => {
                  console.log(
                    `\x1b[32m${DOWNLOAD_UPDATES_LOCK_FOLDER} is now empty, moving new update to ${updatePath}`
                  );
                  moveUpdateFolder();
                  clearInterval(interval);
                  resolve(null);
                };
                try {
                  if (fs.existsSync(lockFolderPath)) {
                    const lockFiles = fs
                      .readdirSync(lockFolderPath)
                      ?.filter((i) => i !== '.DS_Store');
                    if (lockFiles?.length === 0) {
                      handleClearLockFolder();
                    } else {
                      console.log(
                        `Waiting for ${DOWNLOAD_UPDATES_LOCK_FOLDER} to be empty, ${lockFiles?.length} files remaining`
                      );
                    }
                  } else {
                    handleClearLockFolder();
                  }
                } catch (e) {
                  console.log(
                    `Error while waiting for lock folder to be empty ${lockFolderPath}`,
                    e
                  );
                }
              }, 10000);
            });
          })();
        }
      } else {
        console.log(`.lock folder not found ${lockFolderPath}`);
        moveUpdateFolder();
      }
    }
  } catch (e) {
    console.log('failed to copy files', e);
  }
  next();
};

const removeUpdateLockFileMiddleware: Nextable<
  RequestHandler<NextApiPublishUpdateRequest, NextApiResponse>
> = async (req, res, next) => {
  const { updatePath } = req.body;
  const lockFilePath = `${updatePath}/${UPLOAD_UPDATES_LOCK_FILE}`;
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.rmSync(lockFilePath);
    }
  } catch (e) {
    console.log(`failed to remove updateLock file ${lockFilePath}`, e);
  }
  next();
};
router.use(fieldParserMiddleware);
router.use(directoryCreatorMiddleware);
router.use(updateLockFileCreatorMiddleware);
router.use(filesUploaderMiddleware);
router.use(moveFilesFromTempDirectoryMiddleware);
router.use(removeUpdateLockFileMiddleware);

/**
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

 - Note: the .lock file is not very accurate, since after getting the assets from API,
 there's a request for each missing asset to be downloaded (not all assets are always downloaded)
 */
router.post(async (req: NextApiPublishUpdateRequest, res: NextApiResponse) => {
  const { fields, files } = req.body;
  return res.send({ fields, files });
});

export default router.handler({
  onError: (err, req, res) => {
    console.error(err);
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
    externalResolver: true,
  },
};
