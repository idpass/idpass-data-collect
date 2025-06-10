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

import { extractParentUUIDInPath } from '@/utils/dynamicFormIoUtils'
import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/store/auth'
import DynamicHome from '@/views/dynamic/DyHome.vue'
import { initStore } from '@/store'

const dynamicRouter = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: DynamicHome },
    {
      path: '/login/:id',
      name: 'login',
      component: () => import('@/views/dynamic/DynamicLoginView.vue')
    },
    {
      path: '/app/:id',
      name: 'app',
      component: () => import('@/views/dynamic/DynamicAppView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity',
      name: 'entity',
      component: () => import('@/views/dynamic/DynamicEntityView.vue'),
      props: (route) => {
        const id = route.params.id
        const rest = route.params.rest
        const entity = route.params.entity

        // get last route param
        let parentGuid = ''
        if (typeof rest === 'string') {
          // Remove trailing slash and split
          const parts = rest.replace(/\/$/, '').split('/')
          parentGuid = parts[parts.length - 2] || ''
        }

        // Parse the rest parameter to extract entity/guid pairs
        // const pairs = []
        // if (typeof rest === 'string') {
        //   const parts = rest.split('/')

        //   for (let i = 0; i < parts.length; i += 2) {
        //     if (parts[i + 1]) {
        //       pairs.push({ entity: parts[i], guid: parts[i + 1] })
        //     }
        //   }
        // }

        return { id, parentGuid, entity }
      },
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity/new',
      name: 'entity-new',
      component: () => import('@/views/dynamic/DynamicNewView.vue'),
      props: (route) => {
        const id = route.params.id
        const entity = route.params.entity

        const parentGuid = extractParentUUIDInPath(route.fullPath)

        return { id, parentGuid, entity }
      },
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity/:guid/detail',
      name: 'entity-detail',
      component: () => import('@/views/dynamic/DynamicDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity/:guid/edit',
      name: 'entity-edit',
      component: () => import('@/views/dynamic/DynamicEditView.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

dynamicRouter.beforeEach(async (to, _from, next) => {
  if (to.meta.requiresAuth) {
    const authStore = useAuthStore()
    const auth = await authStore.getSyncServerAuth(to.params.id as string)
    if (!auth.token) {
      next({ name: 'login', params: { id: to.params.id } })
      return
    }

    await initStore(auth.userId, auth.token, to.params.id as string, auth.fullSyncServerUrl)
  }
  next()
})

// add a before each for the dynamic router
// dynamicRouter.beforeEach(async (_to, _from, next) => {
//   // init store when the entered a new dynamic app
//   if (_to.path.includes('/app/')) {
//     console.log('here')
//     // check if the store is already initialized
//     if (currentAppId !== _to.params.id) {
//       await closeStore()
//       let token = localStorage.getItem('token_' + _to.params.id)
//       let userId = localStorage.getItem('userId_' + _to.params.id)
//       let fullSyncServerUrl = localStorage.getItem('syncServerUrl_' + _to.params.id)

//       if (!token || !userId) {
//         // get sync server url from the tenant app
//         const tenantApp = await (
//           await db
//         ).collections.tenantapps
//           .findOne({
//             selector: {
//               id: _to.params.id
//             }
//           })
//           .exec()
//           .then((result) => {
//             return result
//           })
//         const syncServerUrl = tenantApp.syncServerUrl
//         let res
//         try {
//           // First try with HTTPS
//           res = await axios.post('https://' + syncServerUrl + '/api/users/login', {
//             email: import.meta.env.VITE_EMAIL,
//             password: import.meta.env.VITE_PASSWORD
//           })
//           fullSyncServerUrl = 'https://' + syncServerUrl
//         } catch (error) {
//           console.error('Try HTTPS failed', error)
//           // If HTTPS fails, try with HTTP
//           res = await axios.post('http://' + syncServerUrl + '/api/users/login', {
//             email: import.meta.env.VITE_EMAIL,
//             password: import.meta.env.VITE_PASSWORD
//           })
//           fullSyncServerUrl = 'http://' + syncServerUrl
//         }
//         token = get(res.data, 'token')
//         userId = get(res.data, 'userId')
//         localStorage.setItem('token_' + _to.params.id, token)
//         localStorage.setItem('userId_' + _to.params.id, userId)
//         localStorage.setItem('syncServerUrl_' + _to.params.id, fullSyncServerUrl)
//       }
//       await initStore(userId, token, _to.params.id as string, fullSyncServerUrl)
//     }
//   }
//   return next()
// })

export default dynamicRouter
