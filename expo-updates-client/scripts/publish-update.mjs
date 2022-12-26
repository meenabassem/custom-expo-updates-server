import {publishUpdate} from "./updates-helper.mjs";

const sendRequest = async (params) => {
    await publishUpdate({
        platform: 'default',
        releaseChannel:"default"
    })
}

sendRequest()

