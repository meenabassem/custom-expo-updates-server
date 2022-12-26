import fs from 'fs';
import mime from 'mime';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';

import { getAppUpdatesPath, getMetadataSync } from '../../common/helpers';

export default function assetsEndpoint(req: NextApiRequest, res: NextApiResponse) {
  const { asset: assetName, runtimeVersion, platform, releaseChannel = 'dev' } = req.query;
  if (!assetName || typeof assetName !== 'string') {
    res.statusCode = 400;
    res.json({ error: 'No asset name provided.' });
    return;
  }

  if (platform !== 'ios' && platform !== 'android') {
    res.statusCode = 400;
    res.json({ error: 'No platform provided. Expected "ios" or "android".' });
    return;
  }

  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    res.statusCode = 400;
    res.json({ error: 'No runtimeVersion provided.' });
    return;
  }

  const updateBundlePath = getAppUpdatesPath({
    releaseChannel: String(releaseChannel),
    platform,
    runtimeVersion,
  });

  const { metadataJson } = getMetadataSync({
    updateBundlePath,
    runtimeVersion,
  });

  const assetPath = path.resolve(assetName);
  const assetMetadata = metadataJson.fileMetadata[platform].assets.find(
    (asset) => asset.path === assetName.replace(`${updateBundlePath}/`, '')
  );
  const isLaunchAsset =
    metadataJson.fileMetadata[platform].bundle === assetName.replace(`${updateBundlePath}/`, '');

  if (!fs.existsSync(assetPath)) {
    res.statusCode = 404;
    res.json({ error: `Asset "${assetName}" does not exist.` });
    return;
  }

  try {
    const asset = fs.readFileSync(assetPath, null);

    res.statusCode = 200;
    res.setHeader(
      'content-type',
      isLaunchAsset ? 'application/javascript' : mime.getType(assetMetadata.ext)
    );
    res.end(asset);
  } catch (error) {
    res.statusCode = 500;
    res.json({ error });
  }
}
