import * as path from "path";
import * as ExpoConfig from "@expo/config";
import * as fs from "fs";
import {exec} from "child_process";
import getFsRecursive from 'node-recursive-directory'
import FormData from "form-data";
import fetch from "node-fetch";

const projectRootDir = path.dirname(process.cwd())
const {exp} = ExpoConfig.getConfig(projectRootDir, {
    skipSDKVersionRequirement: true,
    isPublicConfig: true,
});


/**
 * Executes a shell command and return it as a Promise.
 * @param cmd {string}
 * @return {Promise<string>}
 */
function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn('\'\x1b[33m%s\x1b[0m\'', error);
            }
            if (stdout) {
                resolve(stdout)
            } else if (stderr) {
                reject(stderr)
            } else {
                resolve(null)
            }
        });
    });
}


const generateExpoConfigFile = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            fs.writeFileSync(`${projectRootDir}${path.sep}dist${path.sep}expoConfig.json`,
                JSON.stringify(exp),
                {encoding: 'utf8'})
            resolve(null)
        } catch (e) {
            console.log('Failed to generate expoConfig.json', e)
            reject(e)
        }
    })
}


export const generateBundle = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            await execShellCommand('npm run export-bundle')
            await generateExpoConfigFile()
            resolve(null)
        } catch (e) {
            console.error("Failed to generate update bundle")
            reject(e)
        }
    })
}

export const getFilePaths = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const files = await getFsRecursive('../dist/', true)
            const mappedFiles = files?.map(i => {
                if (i?.filepath && i?.filepath?.split('/dist') && i?.filepath?.split('/dist').length === 2) {
                    return {
                        fullPath: i.fullpath,
                        key: i?.filepath?.split('/dist')[1]
                    }
                } else {
                    return null
                }
            })?.filter(i => i)
            resolve(mappedFiles)
        } catch (e) {
            console.log('Failed to get file paths', e)
            reject(e)
        }

    })
}


export const publishUpdate = async ({platform = 'default', releaseChannel = "dev"} = {}) => {
    const {name, slug, version, runtimeVersion, updates} = exp
    const baseUrl = (new URL(String(updates?.url))).origin
    const updatesUrl = `${baseUrl}/api/publish-update`

    const requestParams = {
        name,
        packageName: slug,
        platform, // To be changed later
        runtimeVersion: String(runtimeVersion),
        jsVersion: String(version),
        releaseChannel
    }


    return new Promise(async (resolve, reject) => {
        try {
            await generateBundle()
            const mappedFiles = await getFilePaths()
            const form = new FormData()
            for (const [key, value] of Object.entries(requestParams)) {
                form.append(key, value)
            }
            mappedFiles?.forEach(file => {
                form.append(file.key, fs.createReadStream(file.fullPath))
            })
            const result = await fetch(updatesUrl, {
                method: "POST",
                body: form,
                headers: form.getHeaders()
            })
            console.log('******************************************')
            console.log('Update Uploaded successfully!')
            console.log('******************************************')
            resolve(null)
        } catch (e) {
            console.error('Failed to push update', e)
            reject(e)
        }
    })
}
