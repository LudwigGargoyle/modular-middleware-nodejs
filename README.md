# Enterprise Integration Middleware for Legacy Systems Modernization

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-No%20License-lightgrey)

> _Modern bridge between legacy and cutting-edge systems, without rewriting core._

---

## Overview  
In complex enterprise environments, the introduction of new technologies often clashes with deeply entrenched legacy systems.  
**This middleware solves that** by functioning as a technology-agnostic _integration hub_, allowing modern services to interact with older applications.

Built with Node.js and TypeScript, it leverages `worker_threads` for **high-performance**, non-blocking integration, while keeping the core legacy systems untouched.

---

## ✨ Key Features  

- **Technology-Agnostic Integration Layer**: Bridges modern APIs (SAML, AI, external services) with legacy systems.  
- **SAML 2.0 SP Support**: Handles full SAML SSO flow, integrating identity providers with legacy backends.  
- **Multithreading via `worker_threads`**: Offloads CPU-heavy tasks, improving scalability and responsiveness.  
- **Modular Architecture**: `ServerBase`, `ServiceBase`, `WorkerBase` classes promote reuse and extension.  
- **Shared Session Data via DB**: Session data (e.g. SAML assertions) stored in a shared SQL table (`auth_sessions`).  
- **Secure by Design**:  
  - Hashed user identifiers  
  - Secure cookies (SameSite, secure flags)  
  - Stateless by default  
- **TypeScript-first**: Strong typing for better maintenance and tooling.

---

## 🔐 SAML SSO Integration — _Use Case_  
A real-world example of how the middleware modernizes authentication:

1. **SAML Authentication**: Middleware (as SAML SP) completes login flow and hashes `name_id`.  
2. **DB Storage**: Stores session data in `auth_sessions`.  
3. **Frontend Cookie Transfer**: Middleware sets short-lived session cookie.  
4. **Header-Based Forwarding**: Frontend passes session ID to backend via HTTP headers.  
5. **Legacy Verification**: Backend reads `auth_sessions` and grants access _without knowing SAML_.

---

## 🤖 AI Services Integration — _Use Case_  
_Example worker not published publicly_  

**Problem**: Legacy app can't access modern AI services.  
**Solution**: Middleware exposes an endpoint → dispatches to AI worker → returns processed data to legacy system.  
Clean separation. No legacy refactoring needed.

---

## ⚙️ Technologies Used  
- `Node.js`: Runtime  
- `TypeScript`: Type safety  
- `Express.js`: Routing  
- `worker_threads`: Background tasks  
- `saml2-js`: SAML protocol  
- `tedious`: MS SQL DB connector  
- `crypto`: Hashing  
- `fs`, `path`: Filesystem ops (e.g. certs)

---

## 🚀 Future Enhancements  
- Abstract DB layer (ORM support)  
- SAML Single Logout (SLO)  
- Better config management  
- Optional API Gateway functions  
- Transition toward microservice architecture

---

> _This middleware is built to modernize, not replace. It empowers legacy systems with minimal disruption._