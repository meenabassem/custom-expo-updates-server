import {publishUpdate} from "./updates-helper.mjs";


const sendRequest = async (params) => {
    await publishUpdate()
}

sendRequest()

