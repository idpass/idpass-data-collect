/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
export const checkFilePermission = async () => {
  const status = await Filesystem.checkPermissions()
  const state = status.publicStorage
  if (state === 'granted') {
    return true
  } else if (state === 'denied') {
    //redirect to main app settings
  } else {
    await Filesystem.requestPermissions()
  }
}

export const dataUrlToBase64 = (dataUrl) => {
  // Check if the input is a valid data URL
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL')
  }

  const [, base64String] = dataUrl.split(',')

  return base64String
}

export const downloadFile = async (fileURL) => {
  const hasPermission = await checkFilePermission()

  if (hasPermission) {
    try {
      const imageFile = dataUrlToBase64(fileURL)
      await Filesystem.writeFile({
        path: 'QRCODE.png',
        data: imageFile,
        directory: Directory.Documents
      })
    } catch (error) {
      console.error(error)
    }
  } else {
    await Filesystem.requestPermissions()
  }
}
