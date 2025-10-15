---
id: glossary
title: Glossary
sidebar_position: 1
---

# Glossary

This section defines key terms and concepts used throughout the IDPASS Data Collect documentation.

## CQRS (Command Query Responsibility Segregation)
CQRS is an architectural pattern that separates the read and update operations for a data store. This means you use a different model to update information than the model you use to read information. This separation can lead to improved performance, scalability, and flexibility, especially in complex domains with high read or write loads.

**Further Reading:**
*   [CQRS (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
*   [CQRS (Martin Fowler)](https://martinfowler.com/bliki/CQRS.html)

## EntityDataManager
The central orchestrator within the `datacollect` client library. It manages all data operations, including processing form submissions into events, coordinating between data stores, and managing synchronization processes.

## EntityStore
A storage component optimized for querying the current, materialized state of entities (e.g., individuals, households). It provides fast read access to data, supporting complex queries and filtering, built from events stored in the EventStore.

## Event Sourcing
Event Sourcing is an architectural pattern where all changes to application state are stored as a sequence of immutable events. Instead of storing the current state, the system stores a log of all actions that led to the current state. This allows for powerful auditing, debugging, and the ability to reconstruct past states.

**Further Reading:**
*   [Event Sourcing (Martin Fowler)](https://martinfowler.com/eaaDev/EventSourcing.html)
*   [Event Sourcing Explained (Event Store)](https://www.eventstore.com/event-sourcing)

## EventStore
An immutable storage mechanism that records all changes to application state as a sequence of discrete, timestamped events. It provides a complete audit trail and enables "time-travel" debugging by reconstructing past states.

## External Sync
The synchronization process between the central backend server and external systems, such as other social protection platforms or custom APIs. This enables data exchange with third-party services.

## IndexedDB
A client-side NoSQL database standard used by web browsers to persistently store large amounts of structured data. In ID PASS DataCollect, it is used for local-first data storage on client devices.

## Internal Sync
The synchronization process between client instances (e.g., mobile or web apps) and the central backend server. This ensures data consistency across all connected client devices.

## JWT (JSON Web Token)
A compact, URL-safe means of representing claims between two parties. In ID PASS DataCollect, JWTs are used for secure authentication and authorization, allowing role-based access control to API endpoints.

## Multi-Tenant Support
An architectural capability that allows a single instance of the ID PASS DataCollect backend to serve multiple independent organizations or applications. Each tenant's data and configurations are isolated, ensuring privacy and security.

## Offline-First Architecture
A design principle where an application functions primarily using local data, with synchronization to a remote server as a secondary, enhancing feature. This ensures the application remains fully functional even without internet connectivity.

## PNPM
A fast, disk space efficient package manager for JavaScript that uses hard links and symlinks to manage dependencies. It's used in this monorepo to optimize dependency installation and reduce disk space usage.

## PostgreSQL
A powerful, open-source relational database system widely used for server-side data storage. In ID PASS DataCollect, it serves as the primary database for the backend, storing both events and the current state of entities.

## Two-Level Synchronization
Refers to the two distinct synchronization processes within ID PASS DataCollect: Client ↔ Server (Internal Sync) and Server ↔ External Systems (External Sync).
