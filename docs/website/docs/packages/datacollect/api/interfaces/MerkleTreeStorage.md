[idpass-data-collect](../index.md) / MerkleTreeStorage

# Interface: MerkleTreeStorage

Defined in: [interfaces/types.ts:605](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L605)

Merkle tree storage interface for data integrity verification.

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:607](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L607)

Initialize the Merkle tree storage

#### Returns

`Promise`\<`void`\>

***

### saveRootHash()

> **saveRootHash**(`hash`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:609](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L609)

Save the root hash of the Merkle tree

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<`void`\>

***

### getRootHash()

> **getRootHash**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:611](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L611)

Get the current root hash

#### Returns

`Promise`\<`string`\>

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:613](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L613)

Clear the Merkle tree storage

#### Returns

`Promise`\<`void`\>

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:615](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L615)

Close storage connections

#### Returns

`Promise`\<`void`\>
