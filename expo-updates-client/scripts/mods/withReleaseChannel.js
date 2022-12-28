const {AndroidConfig, withAndroidManifest, withPlugins, withExpoPlist} = require("expo/config-plugins")

const withReleaseChannelAndroid = config => {
    return withAndroidManifest(config, async config => {
        try {
            const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
            AndroidConfig.Manifest.addMetaDataItemToMainApplication(mainApplication,
                AndroidConfig.Updates.Config.RELEASE_CHANNEL,
                config.updates?.releaseChannel
            )
        } catch (e) {
            console.error("Failed to update android release channel',e")
        }
        return config
    });
};

const withReleaseChanneliOS = config => {
    return withExpoPlist(config, config => {
        config.modResults.EXUpdatesReleaseChannel = config.updates?.releaseChannel
        return config
    })
};


module.exports = config => withPlugins(
    config,
    [
        withReleaseChannelAndroid,
        withReleaseChanneliOS
    ]
)
