import FormData from 'form-data';
import { NextApiRequest, NextApiResponse } from 'next';
import { serializeDictionary } from 'structured-headers';

import {
  getAssetMetadataSync,
  getMetadataSync,
  convertSHA256HashToUUID,
  convertToDictionaryItemsRepresentation,
  signRSASHA256,
  getPrivateKeyAsync,
  getExpoConfigSync,
  getAppUpdatesPath,
} from '../../common/helpers';
import { TUpdateRequestParams } from '../../types/types';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { DOWNLOAD_UPDATES_LOCK_FOLDER, UPLOAD_UPDATES_LOCK_FILE } from './consts';

export default async function manifestEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.json({ error: 'Expected GET.' });
    return;
  }

  const platform = req.headers['expo-platform'] ?? req.query['platform'];
  if (platform !== 'ios' && platform !== 'android') {
    res.statusCode = 400;
    res.json({
      error: 'Unsupported platform. Expected either ios or android.',
    });
    return;
  }

  const runtimeVersion = req.headers['expo-runtime-version'] ?? req.query['runtime-version'];
  const releaseChannel = (req.headers['expo-release-channel'] ??
    req.query['expo-release-channel']) as TUpdateRequestParams['releaseChannel'];

  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    res.statusCode = 400;
    res.json({
      error: 'No runtimeVersion provided.',
    });
    return;
  }
  let updateLockFilePath = null;
  try {
    const updateBundlePath = getAppUpdatesPath({ releaseChannel, platform, runtimeVersion });
    if (fs.existsSync(`${updateBundlePath}/${UPLOAD_UPDATES_LOCK_FILE}`)) {
      res.statusCode = 520;
      // an update is being pushed on the server for this configuration for now
      return res.json({ error: 'SERVER_UPDATE' });
    }
    updateLockFilePath = `${updateBundlePath}/${DOWNLOAD_UPDATES_LOCK_FOLDER}/${uuidv4()}`;
    fs.writeFileSync(updateLockFilePath, '');
    const { metadataJson, createdAt, id } = getMetadataSync({
      updateBundlePath,
      runtimeVersion,
    });
    const expoConfig = getExpoConfigSync({
      updateBundlePath,
      runtimeVersion,
    });
    const platformSpecificMetadata = metadataJson.fileMetadata[platform];
    const manifest = {
      id: convertSHA256HashToUUID(id),
      createdAt,
      runtimeVersion,
      assets: platformSpecificMetadata.assets.map((asset) =>
        getAssetMetadataSync({
          updateBundlePath,
          filePath: asset.path,
          ext: asset.ext,
          releaseChannel,
          runtimeVersion,
          platform,
          isLaunchAsset: false,
        })
      ),
      launchAsset: getAssetMetadataSync({
        updateBundlePath,
        filePath: platformSpecificMetadata.bundle,
        isLaunchAsset: true,
        releaseChannel,
        runtimeVersion,
        platform,
        ext: null,
      }),
      metadata: {},
      extra: {
        expoClient: expoConfig,
      },
    };

    let signature = null;
    const expectSignatureHeader = req.headers['expo-expect-signature'];
    if (expectSignatureHeader) {
      const privateKey = await getPrivateKeyAsync();
      if (!privateKey) {
        res.statusCode = 400;
        res.json({
          error: 'Code signing requested but no key supplied when starting server.',
        });
        return;
      }
      const manifestString = JSON.stringify(manifest);
      const hashSignature = signRSASHA256(manifestString, privateKey);
      const dictionary = convertToDictionaryItemsRepresentation({
        sig: hashSignature,
        keyid: 'main',
      });
      signature = serializeDictionary(dictionary);
    }

    const assetRequestHeaders = {};
    [...manifest.assets, manifest.launchAsset].forEach((asset) => {
      assetRequestHeaders[asset.key] = {
        'test-header': 'test-header-value',
      };
    });

    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest), {
      contentType: 'application/json',
      header: {
        'content-type': 'application/json; charset=utf-8',
        ...(signature ? { 'expo-signature': signature } : {}),
      },
    });
    form.append('extensions', JSON.stringify({ assetRequestHeaders }), {
      contentType: 'application/json',
    });

    res.statusCode = 200;
    res.setHeader('expo-protocol-version', 0);
    res.setHeader('expo-sfv-version', 0);
    res.setHeader('cache-control', 'private, max-age=0');
    res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
    res.write(form.getBuffer());
    res.end();
  } catch (error) {
    console.error(error);
    res.statusCode = 404;
    res.json({ error });
  } finally {
    if (updateLockFilePath) {
      try {
        fs.rmSync(updateLockFilePath, { recursive: true, force: true });
      } catch (e) {
        console.log('Failed to remove update lock file', updateLockFilePath);
      }
    }
  }
}
