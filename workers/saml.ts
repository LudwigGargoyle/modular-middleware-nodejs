/**
 * Worker utilized by multithreading to concurrently handle requests sent to the Service Provider.
 * @module worker_saml
 */

import { workerData, parentPort } from 'worker_threads';
import { Connection, ConnectionConfiguration, Request, TYPES } from 'tedious'; 
import saml from 'saml2-js'; // SAML library dependency
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Re-defining types locally for showcase purposes, as defs.ts is not published.
type TCookieOptions = {
    secure: boolean; 
    domain: string; 
    path: string;
    sameSite: "strict" | "lax" | "none";
    maxAge: number;
}

type TRelayState = {
    origin: string;
    appName: string;
    idpName: string;
}

type TSAMLAuthData = {
    name_id: string;
    session_index: string;
    auth_time: Date;
    relay_state?: TRelayState;
    cookie_options?: TCookieOptions;
};

import { WorkerBase } from './defs/worker';

/**
 * SAML Worker Class
 * @class
 */
class SamlWorker extends WorkerBase {
    sp: saml.ServiceProvider;

    constructor() {
        super();
        this.sp = null;
    }   

    /**
     * Overrides the base `run` method to initialize the SAML Service Provider (SP)
     * before executing the specified endpoint.
     * @param {string} endpoint The method of the worker to execute.
     * @returns {void}
     */
    run(endpoint: string): void {
        const onServiceProviderOptions = (spOptions: saml.ServiceProviderOptions) => {
            this.sp = new saml.ServiceProvider(spOptions);
            super.run(endpoint); // Call the base Worker's run method after SP is initialized
        }
        this.getServiceProvider().then(onServiceProviderOptions, (error) => { throw error });
    }
    
    /**
     * Generates test authentication data (cookie) based on configuration.
     * This endpoint is primarily for testing the cookie creation mechanism.
     * @returns {void}
     */
    cookie(): void {
        const SAMLAuthData: TSAMLAuthData = {
            name_id: 'john.doe@test.xyz',
            session_index: '42 is the answer',
            auth_time: new Date(),
            cookie_options: {
                secure: workerData.settings[workerData.name].CookieSecure,
                // Dynamically sets domain based on appName from query, falls back to a generic domain.
                domain: workerData.query && workerData.query.appName ? workerData.settings[(workerData.query.appName as string)].CookieDomain : '.example.com', 
                // Dynamically sets path based on appName from query, falls back to root path.
                path: workerData.query && workerData.query.appName ? workerData.settings[(workerData.query.appName as string)].CookiePath : '/',
                sameSite: 'strict',
                maxAge: (workerData.settings[workerData.name].CookieTimeout || 1) * 60 * 1000
            }
        }
        this.storeAuthData(SAMLAuthData); // Store authentication data and send back to parent
    }
    
    /**
     * Generates and returns the SAML Service Provider metadata XML.
     * This metadata is used by Identity Providers to configure trust with this Service Provider.
     * @returns {void}
     */
    metadata(): void {
        const metadata: string = this.sp.create_metadata();
        parentPort.postMessage(metadata);
    }
    
    /**
     * Initiates the SAML Single Sign-On (SSO) flow by redirecting the user's browser
     * to the Identity Provider's login page.
     * @returns {void}
     */
    sso_redirect(): void { // Renamed from spinitsso_redirect_2g
        const RelayState: TRelayState = JSON.parse(workerData.query.RelayState as string);
        const onIdentityProviderOptions = (idpOptions: saml.IdentityProviderOptions) => {
            const idp: saml.IdentityProvider = new saml.IdentityProvider(idpOptions);
            const options: saml.CreateLoginRequestUrlOptions = {
                relay_state: (workerData.query.RelayState as string)
            }
            const onLoginRequest = (error: Error | null, loginUrl: string, requestId: string) => {
                if (error) 
                    throw error;
                parentPort.postMessage(loginUrl);
            }
            
            this.sp.create_login_request_url(idp, options, onLoginRequest);
        }

        this.getIdentityProvider(RelayState.idpName).then(onIdentityProviderOptions, (error) => { throw error });
    }
    
    /**
     * Handles the Assertion Consumer Service (ACS) endpoint.
     * Validates the SAML Assertion received from the Identity Provider and processes user authentication.
     * @returns {void}
     */
    acs(): void { // Renamed from acs_2g
        const relayState: TRelayState = JSON.parse(workerData.body.RelayState as string);
        const onIdentityProviderOptions = (idpOptions: saml.IdentityProviderOptions) => {
            const idp: saml.IdentityProvider = new saml.IdentityProvider(idpOptions);
            const options: saml.PostAssertOptions = {
                request_body: workerData.body,
                require_session_index: true
            }
            const onAssertionValidation = (error: Error | null, samlResponse: saml.SAMLAssertResponse) => {
                if (error) 
                    throw error;
                const SAMLAuthData: TSAMLAuthData = {
                    name_id: crypto.createHash('sha256').update(samlResponse.user.name_id).digest('hex'), // Hashes name_id for privacy/security
                    session_index: (samlResponse.user.session_index as string),
                    auth_time: new Date(),
                    relay_state: relayState,
                    cookie_options: {
                        secure: workerData.settings[workerData.name].CookieSecure,
                        domain: workerData.settings[relayState.appName].CookieDomain,
                        path: workerData.settings[relayState.appName].CookiePath,
                        sameSite: 'strict',
                        maxAge: (workerData.settings[workerData.name].CookieTimeout || 1) * 60 * 1000
                    }    
                }
                this.storeAuthData(SAMLAuthData); // Store authentication data and send back to parent
            }
    
            this.sp.post_assert(idp, options, onAssertionValidation);
        }

        this.getIdentityProvider(relayState.idpName).then(onIdentityProviderOptions, (error) => { throw error });
    }

    /**
     * Retrieves the configuration for the Service Provider (SP) from settings.
     * Reads private key and certificate files.
     * @returns {Promise<saml.ServiceProviderOptions>} A promise that resolves with the SP options.
     */
    getServiceProvider(): Promise<saml.ServiceProviderOptions> {
        return new Promise((resolve, reject) => {
            let sp: saml.ServiceProviderOptions = {
                entity_id: workerData.settings[workerData.name].SPEntityID,
                allow_unencrypted_assertion: true,
                assert_endpoint: '', // This will be set by the service using SP.create_metadata() or similar
                private_key: '',
                certificate: ''
            }

            this.readFile(path.join('.', 'sp', 'cert.cer'), sp, 'certificate').then(
                () => {
                    this.readFile(path.join('.', 'sp', 'key.pem'), sp, 'private_key').then(
                        () => {
                            resolve(sp);
                        },
                        (error) => {
                            reject(error);
                        }
                    );
                },
                (error) => {
                    reject(error);
                }
            );
        })
    }
    
    /**
     * Retrieves the configuration for a specific Identity Provider (IdP) from settings.
     * Reads IdP certificate files.
     * @param {string} idpName The name of the section in the configuration file that describes the IdP to use.
     * @returns {Promise<saml.IdentityProviderOptions>} A promise that resolves with the IdP options.
     */
    getIdentityProvider(idpName: string): Promise<saml.IdentityProviderOptions> {
        return new Promise((resolve, reject) => {
            let idp: saml.IdentityProviderOptions = {
                sso_login_url: workerData.settings[idpName].IDPLoginEndpoint,
                sso_logout_url: workerData.settings[idpName].IDPLogoutEndpoint,
                certificates: []
            };

            this.readFile(path.join('.', 'idps', idpName, 'cert.cer'), idp, 'certificates').then(
                () => { 
                    resolve(idp);
                },
                (error) => { 
                    reject(error);
                }
            );
        })
    }    
    
    /**
     * Reads a file and copies its content into a specified property of an object.
     * Used for loading certificates and private keys.
     * @param {fs.PathOrFileDescriptor} file The file descriptor.
     * @param {saml.ServiceProviderOptions | saml.IdentityProviderOptions} obj The object into which to copy the file content.
     * @param {string} property The property of the object into which to copy the file content.
     * @returns {Promise<void>} A promise that resolves when the file is read and content copied, or rejects on error.
     */
    readFile(file: fs.PathOrFileDescriptor, obj: saml.ServiceProviderOptions | saml.IdentityProviderOptions, property: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const callback = (error: NodeJS.ErrnoException | null, data: string) => {
                if (error) {
                    // Obfuscate specific file path errors in production/debug mode
                    if (!workerData.debug)
                        error = new Error('Cannot read Service Provider or Identity Provider settings. Check file paths and permissions.');
                    reject(error);
                } else if (!obj.hasOwnProperty(property))
                    reject(new Error('Invalid option property provided for file content.'));
                else {
                    // Handles both single string properties and array of strings (for multiple certificates)
                    obj[property] = Array.isArray(obj[property]) ? [data] : data;
                    resolve();
                }
            }

            fs.readFile(file, { encoding: 'utf8' }, callback);
        });
    }

    /**
     * Stores authentication data in the configured database and sends the
     * authentication object back to the main thread for cookie generation.
     * Uses `tedious` for MS SQL Server interaction.
     * This database table (`auth_sessions`) acts as the central point for the legacy backend 
     * to verify user authentication. After a successful SAML SSO flow:
     * 1. The middleware writes the user's hashed `name_id` and the Identity Provider's `session_index` to this table.
     * 2. The legacy frontend receives a session ID in a cookie (set by this middleware).
     * **Important:** This cookie is designed for immediate consumption by the legacy frontend
     * and is expected to be removed/invalidated by the frontend right after being read.
     * 3. This frontend then passes this session ID to the legacy backend, typically within custom HTTP headers,
     * or possibly as part of the request body (e.g., a dedicated session verification endpoint).
     * 4. The legacy backend retrieves this session ID and queries the `auth_sessions` table
     * to confirm the user's active session and authentication status with the Identity Provider.
     * Uses `tedious` for MS SQL Server interaction.
     * @param {TSAMLAuthData} SAMLAuthData Object containing the SAML authentication data.
     * @returns {void}
     */
    storeAuthData(SAMLAuthData: TSAMLAuthData): void {
        const db: ConnectionConfiguration = {
            server: workerData.settings[workerData.name].Server,
            options: {
                encrypt: true,
                database: workerData.settings[workerData.name].Database,
                trustServerCertificate: true // Crucial for self-signed or non-public certs
            },
            authentication: {
                type: 'default', // Or 'ntlm', 'azure-active-directory-access-token', etc.
                options: {
                    userName: workerData.settings[workerData.name].Username,
                    password: workerData.settings[workerData.name].Password
                }
            }
        }

        const onConnect = (error: Error | undefined) => {  
            if (error) {
                if (workerData.debug)
                    throw error;
                else
                    throw new Error('Cannot connect to database for SAML session storage.');
            }
            if (workerData.debug)
                console.log(new Date().toLocaleString() + ' db connection established for SAML session');
            
            // SQL MERGE statement to upsert SAML session data
            const sql = 'merge auth_sessions as dest ' + 
                        'using (select * from (values(@name_id, @session_index, @auth_time)) SAMLAuthData(name_id, session_index, auth_time)) as source on source.name_id = dest.name_id ' +
                        'when matched then update set dest.session_index = source.session_index, dest.auth_time = source.auth_time ' +
                        'when not matched then insert(name_id, session_index, auth_time) values(source.name_id, source.session_index, source.auth_time);';
            
            const request: Request = new Request(sql, onExecSQL);  
            request.addParameter('name_id', TYPES.NVarChar, SAMLAuthData.name_id); 
            request.addParameter('session_index', TYPES.NVarChar, SAMLAuthData.session_index); 
            request.addParameter('auth_time', TYPES.DateTime, SAMLAuthData.auth_time); 
            connection.execSql(request);          
        }

        const onExecSQL = (error: Error | null | undefined) => {  
            connection.close(); // Ensure connection is closed after query
            if (error) {
                if (workerData.debug)
                    throw error;
                else
                    throw new Error('Cannot execute SQL statement for SAML session storage.');
            }
            if (workerData.debug)
                console.log(new Date().toLocaleString() + ' sql statement executed for SAML session');
            parentPort.postMessage(SAMLAuthData); // Send authentication data back to the main thread
        }

        const connection = new Connection(db);
        connection.on('connect', onConnect); // Event listener for connection
        connection.connect(); // Initiate connection
    }    
}

// Instantiate the worker and run the specified endpoint
const Worker = new SamlWorker();
Worker.run(workerData.endpoint);
