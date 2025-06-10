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

import * as CryptoJS from "crypto-js";

/**
 * Utility functions for creating and managing Merkle trees for data integrity verification.
 * 
 * This module provides cryptographic utilities for building Merkle trees from entity data,
 * enabling tamper-evident storage and efficient integrity verification. Merkle trees allow
 * verification of individual records without needing to download the entire dataset.
 * 
 * Key features:
 * - **Cryptographic Integrity**: Uses SHA-256 hashing for tamper detection
 * - **Efficient Verification**: Logarithmic proof verification time
 * - **Data Structure Agnostic**: Works with any string-serializable data
 * - **Binary Tree Construction**: Standard binary Merkle tree implementation
 * - **Odd Node Handling**: Properly handles odd numbers of leaf nodes
 * 
 * Architecture:
 * - Builds bottom-up from leaf nodes (entity hashes) to root
 * - Each internal node is the hash of its two children
 * - Odd layers carry the last node up unchanged
 * - Root hash represents the entire dataset's fingerprint
 * 
 * @example
 * Basic Merkle tree creation:
 * ```typescript
 * const entities = [
 *   '{"id":"1","name":"John Doe"}',
 *   '{"id":"2","name":"Jane Smith"}',
 *   '{"id":"3","name":"Bob Wilson"}',
 *   '{"id":"4","name":"Alice Brown"}'
 * ];
 * 
 * const merkleRoot = createMerkleTree(entities);
 * console.log('Dataset fingerprint:', merkleRoot[0]);
 * ```
 * 
 * @example
 * With FormSubmission events:
 * ```typescript
 * const events = await eventStore.getAllEvents();
 * const serializedEvents = events.map(event => JSON.stringify(event));
 * const rootHash = createMerkleTree(serializedEvents);
 * 
 * // Store root hash for later integrity verification
 * await eventStore.saveMerkleRoot(rootHash[0]);
 * ```
 * 
 * @example
 * Integrity verification workflow:
 * ```typescript
 * // Initial dataset
 * const originalData = ['record1', 'record2', 'record3'];
 * const originalRoot = createMerkleTree(originalData)[0];
 * 
 * // Later verification
 * const currentData = getCurrentDataset();
 * const currentRoot = createMerkleTree(currentData)[0];
 * 
 * if (originalRoot === currentRoot) {
 *   console.log('Data integrity verified - no tampering detected');
 * } else {
 *   console.error('Data integrity compromised - tampering detected!');
 * }
 * ```
 */

/**
 * Computes SHA-256 hash of input data.
 * 
 * @param data - String data to hash
 * @returns SHA-256 hash in hexadecimal format
 * 
 * @private
 */
function hash(data: string): string {
  return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
}

/**
 * Creates a Merkle tree from a list of string entities and returns the root hash.
 * 
 * This function builds a binary Merkle tree by recursively hashing pairs of nodes
 * until a single root hash remains. Each leaf node is the hash of an entity string,
 * and each internal node is the hash of its two children concatenated.
 * 
 * The tree construction ensures that any modification to any entity will result
 * in a different root hash, providing cryptographic proof of data integrity.
 * 
 * @param entities - Array of string representations of entities to include in the tree
 * @returns Array containing the single root hash
 * @throws {Error} When the entity list is empty
 * 
 * @example
 * ```typescript
 * const entityData = [
 *   JSON.stringify({ id: 1, name: 'Alice', type: 'individual' }),
 *   JSON.stringify({ id: 2, name: 'Bob', type: 'individual' }),
 *   JSON.stringify({ id: 3, name: 'Smith Family', type: 'group' })
 * ];
 * 
 * const rootHash = createMerkleTree(entityData);
 * console.log('Merkle root:', rootHash[0]);
 * // Output: "a1b2c3d4e5f6..." (SHA-256 hash)
 * ```
 * 
 * @example
 * Event store integration:
 * ```typescript
 * const events = await eventStore.getAllEvents();
 * const eventStrings = events.map(event => JSON.stringify(event));
 * const merkleRoot = createMerkleTree(eventStrings);
 * 
 * // Verify against stored root
 * const storedRoot = await eventStore.getMerkleRoot();
 * if (merkleRoot[0] === storedRoot) {
 *   console.log('Event store integrity verified');
 * }
 * ```
 * 
 * @example
 * Handling tree construction:
 * ```typescript
 * // Works with any number of entities
 * const singleEntity = createMerkleTree(['entity1']);     // [hash('entity1')]
 * const evenCount = createMerkleTree(['e1', 'e2', 'e3', 'e4']); // Balanced tree
 * const oddCount = createMerkleTree(['e1', 'e2', 'e3']);  // Last node carried up
 * ```
 */
export function createMerkleTree(entities: string[]): string[] {
  if (entities.length === 0) {
    throw new Error("Entity list is empty");
  }

  // Hash each entity
  let layer = entities.map((entity) => hash(entity));

  // Build the tree
  while (layer.length > 1) {
    layer = buildNextLayer(layer);
  }

  // Return the root hash
  return layer;
}

/**
 * Builds the next layer of the Merkle tree by hashing pairs of nodes.
 * 
 * This helper function takes a layer of hash values and creates the next layer up
 * by hashing pairs of adjacent nodes. If there's an odd number of nodes, the last
 * node is carried up unchanged to the next layer.
 * 
 * @param layer - Array of hash values from the current tree layer
 * @returns Array of hash values for the next layer up
 * 
 * @private
 * 
 * @example
 * ```typescript
 * // Input layer: ['hash1', 'hash2', 'hash3', 'hash4']
 * // Output: [hash('hash1hash2'), hash('hash3hash4')]
 * 
 * // Input layer: ['hash1', 'hash2', 'hash3'] (odd count)
 * // Output: [hash('hash1hash2'), 'hash3'] (last carried up)
 * ```
 */
function buildNextLayer(layer: string[]): string[] {
  const nextLayer: string[] = [];

  for (let i = 0; i < layer.length; i += 2) {
    if (i + 1 < layer.length) {
      // Hash the concatenation of two adjacent hashes
      nextLayer.push(hash(layer[i] + layer[i + 1]));
    } else {
      // If there's an odd number of elements, carry the last one up
      nextLayer.push(layer[i]);
    }
  }

  return nextLayer;
}

// Example usage
// const entities = ["entity1", "entity2", "entity3", "entity4"];
// const merkleRoot = createMerkleTree(entities);
// console.log("Merkle Root:", merkleRoot[0]);
