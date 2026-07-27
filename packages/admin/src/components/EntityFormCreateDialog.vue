<!--
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
-->

<script setup lang="ts">
import { ref } from 'vue'

// props dependsOn list
interface Props {
  dependsOnList?: {
    name: string
    title: string
  }[]
}
const { dependsOnList } = defineProps<Props>()

const dialog = ref(false)

const form = ref({
  name: '',
  title: '',
  dependsOn: '',
})
</script>

<template>
  <v-dialog v-model="dialog" f>
    <v-card>
      <v-card-title>Create Entity Form</v-card-title>
      <v-card-text>
        <v-form>
          <v-text-field v-model="form.name" label="Name" required></v-text-field>
          <v-text-field v-model="form.title" label="Title" required></v-text-field>
          <v-select
            v-if="dependsOnList && dependsOnList.length > 0"
            v-model="form.dependsOn"
            label="Depends On"
            :items="dependsOnList"
            required
          ></v-select>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
