<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Barcode, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Camera } from '@capacitor/camera'
import { useDatabase } from '@/database'
import { v4 as uuidv4 } from 'uuid'
import { Clipboard } from '@capacitor/clipboard'

const isGrantedPermissions = ref(false)

const forms = ref<unknown[]>([])

const database = useDatabase()

const writeToClipboard = async (text: string) => {
  await Clipboard.write({
    string: text
  })
}

const scanSingleBarcode = async (): Promise<Barcode> => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    document.querySelector('body')?.classList.add('barcode-scanner-active')

    const listener = await BarcodeScanner.addListener('barcodeScanned', async (result) => {
      await listener.remove()
      document.querySelector('body')?.classList.remove('barcode-scanner-active')
      await BarcodeScanner.stopScan()
      resolve(result.barcode)
    })

    await BarcodeScanner.startScan()
  })
}

const requestPermissions = async (): Promise<boolean> => {
  const { camera } = await Camera.requestPermissions()
  return camera === 'granted' || camera === 'limited'
}

const scan = async () => {
  try {
    if (!isGrantedPermissions.value) {
      const granted = await requestPermissions()
      isGrantedPermissions.value = granted
      if (!granted) {
        return
      }
    }

    const code = await scanSingleBarcode()
    const url = code.displayValue

    const response = await fetch(url)
    const data = await response.json()
    const form = JSON.stringify(data.form ?? {})

    const obj = {
      id: uuidv4(),
      name: data.site_name,
      url: url,
      form: form,
      timestamp: new Date().toISOString()
    }
    await database.forms.insert(obj)

    database.forms
      .find({
        selector: {}
      })
      .exec()
      .then((result) => {
        forms.value = result
      })
  } catch (error) {
    await writeToClipboard(JSON.stringify(error))
    alert(JSON.stringify(error))
  }
}

onMounted(async () => {
  Camera.checkPermissions().then(({ camera }) => {
    isGrantedPermissions.value = camera === 'granted' || camera === 'limited'
  })

  database.forms
    .find({
      selector: {}
    })
    .exec()
    .then((result) => {
      forms.value.push(...result)
    })
})
</script>

<template>
  <div>
    <button
      class="btn btn-primary p-3 rounded-circle position-absolute"
      style="bottom: 1rem; right: 1rem"
      @click="scan"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        style="height: 2rem; width: 2rem; fill: #fff"
      >
        <path
          d="M149.1 64.8L138.7 96H64C28.7 96 0 124.7 0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H373.3L362.9 64.8C356.4 45.2 338.1 32 317.4 32H194.6c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}
</style>
