import withReleaseChannel from "./scripts/mods/withReleaseChannel";

export default ({config}) => {
    if (!config.plugins) config.plugins = [];
    config.plugins.push(
        withReleaseChannel
    );
    return config;
};
