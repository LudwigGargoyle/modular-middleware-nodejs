/**
 * SAML Service Provider Module.
 * @module routes/saml
 */

import { Request, Response } from 'express';
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

type TWorkerCallback = (request: Request, response: Response, value: TSAMLAuthData | string) => void;


import { ServerBase } from '../defs/server';
import { ServiceBase } from '../defs/service';

/**
 * SAML Service Class
 * * This class implements a Service Provider (SP) for SAML-based federated authentication.
 * * It handles interactions with an Identity Provider (IdP) for single sign-on (SSO).
 * *
 * * Routes/Endpoints:
 * * - **/cookie** (GET): Produces test authentication data (cookie) based on configuration for a specified application.
 * * - **/metadata** (GET): Generates the SAML Service Provider metadata XML for data exchange with the Identity Provider.
 * * - **/sso-redirect** (GET): Initiates the federated authentication flow by redirecting the browser to the Identity Provider's login page.
 * * - **/acs** (POST): Validates the SAML Assertion returned by the Identity Provider and manages the user session.
 * * @class
 */
class SAMLService extends ServiceBase {
    
    constructor() {
        super();
        this.name = 'SAML';
        this.title = 'SAML Service Provider Middleware'; 
        this.auth = false; 
    }

    /**
     * Initializes the SAML service and registers its specific routes.
     * Overrides the base `init` method to add SAML-specific routing logic.
     * @param {ServerBase} server The server instance this service is registered with.
     * @returns {void}
     */
    init(server: ServerBase) {
        super.init(server); // Call the base class's init method first
    
        // Callback to handle test cookie generation
        const cookieCallback: TWorkerCallback = (req: Request, res: Response, SAMLAuthData: TSAMLAuthData) => {
            if (this.server.debug)
                console.log(new Date().toLocaleString() +' sending test cookie: ' + JSON.stringify(SAMLAuthData));
            // Setting a generic cookie name. Consider making this configurable or clearer.
            res.cookie("SAML_Test_Session", JSON.stringify(SAMLAuthData), SAMLAuthData.cookie_options); 
            res.status(200).send(this.title + ': cookie has been successfully sent and is available at application URL.');
        };

        // Callback to handle metadata XML generation
        const metadataCallback: TWorkerCallback = (req: Request, res: Response, metadata: string) => {
            res.set('Content-Type', 'text/xml');
            res.send(metadata);
        };

        // Callback to initiate SSO redirect to IdP
        const ssoRedirectCallback: TWorkerCallback = (req: Request, res: Response, loginUrl: string) => {
            res.redirect(loginUrl);
        };

        // Callback for Assertion Consumer Service (ACS) - handles IdP's response
        const acsCallback: TWorkerCallback = (req: Request, res: Response, SAMLAuthData: TSAMLAuthData) => {
            const relayState: TRelayState = JSON.parse(req.body.RelayState); // Parse RelayState from IdP response
            if (this.server.debug)
                console.log(new Date().toLocaleString() +' sending cookie: ' + JSON.stringify(SAMLAuthData));
            res.cookie("SAML_Login_Session", JSON.stringify(SAMLAuthData), SAMLAuthData.cookie_options); 
            // Redirect to the client application's URL after successful authentication
            res.redirect(this.server.settings[relayState.appName].LocalClientUrl || '/'); 
        };

        // Register routes with their respective handlers
        this.router.get('/cookie', this.createRequestHandler('cookie', cookieCallback));
        this.router.get('/metadata', this.createRequestHandler('metadata', metadataCallback));
        this.router.get('/sso-redirect', this.urlencodedParser, this.createRequestHandler('spinitsso_redirect', ssoRedirectCallback)); // Renamed endpoint
        this.router.post('/acs', this.urlencodedParser, this.createRequestHandler('acs', acsCallback)); // Renamed endpoint
    }    
}

export default SAMLService;
