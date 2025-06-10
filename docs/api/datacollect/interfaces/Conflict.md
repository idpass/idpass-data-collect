[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / Conflict

# Interface: Conflict

Defined in: [interfaces/types.ts:624](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L624)

Represents a conflict between local and remote entity versions.

Occurs during synchronization when the same entity has been
modified both locally and remotely.

## Properties

### local

> **local**: [`EntityPair`](EntityPair.md)

Defined in: [interfaces/types.ts:626](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L626)

Local version of the entity

***

### remote

> **remote**: [`EntityPair`](EntityPair.md)

Defined in: [interfaces/types.ts:628](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L628)

Remote version of the entity
