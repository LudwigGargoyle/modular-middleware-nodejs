/**
 * Server Module.
 * @module defs/server
 */

import express from 'express';
import { Express, RequestHandler, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from "helmet";
import https from 'https';
import { title } from '../config/config'; 
import fs from 'fs';
import path from 'path';

interface IServerBase {
    app: Express;
    title: string;
    settings: any; 
    path: string;
    debug: boolean;
    https: boolean;
    port: string;
    ssl: https.ServerOptions;
    allowedOrigins: string;
    init: () => void;
    registerService: (service: any) => void; 
    start: () => void;
}

/**
 * Server Class
 * @class
 */
class ServerBase implements IServerBase {
    /**
     * Node.js Express application object.
     * @property {Express} app 
     */
    app: Express;
    /**
     * Title.
     * @property {string} title
     */
    title: string;
    /**
     * Contains the server's configuration, generated from the .ini file.
     * @property {any} settings 
     */
    settings: any;

    constructor(iniFile: any) {
        this.app = express();
        this.title = title;
        this.settings = iniFile;
    }

    /**
     * Server base path (part of the URL).
     * @property {string} path 
     */
    public get path() {
        return (this.settings.Main.Path ? '/' + this.settings.Main.Path : '')
    }

    /**
     * Indicates whether service and worker logs will be generated.
     * @property {boolean} debug
     */
    public get debug() {
        return this.settings.Main.Debug;
    }

    /**
     * Indicates whether the SSL protocol will be used (e.g., for standalone HTTPS).
     * @property {boolean} https
     */
    public get https() {
        return this.settings.Main.HTTPS;
    }

    /**
     * Indicates the port on which the server is listening (e.g., for standalone execution or internal listening behind a proxy).
     * @property {string} port
     */
    public get port() {
        return this.settings.Main.ServicePort;
    }

    /**
     * Describes the object containing the private key and certificate required for the SSL protocol (e.g., for standalone HTTPS).
     * @property {https.ServerOptions} ssl
     */
    public get ssl() {
        const settings = this.settings;
        const ssl: https.ServerOptions = {
            key: settings.Main.HTTPS ? fs.readFileSync(path.join('.', 'ssl', 'key.pem'), 'utf-8') : '',
            cert: settings.Main.HTTPS ? fs.readFileSync(path.join('.', 'ssl', 'cert.cer'), 'utf-8') : ''
        };
        return ssl;
    }

    /**
     * Indicates the comma-separated list of domains authorized to send cross-domain requests.
     * @property {string} allowedOrigins 
     */
    public get allowedOrigins() {
        return this.settings.Main.AllowedOrigins;
    }

    /**
     * Initializes the server middleware.
     * @returns {void}
     */
    init(): void {
        // Log received requests and memory usage
        const log: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
            console.log(new Date().toLocaleString() + ': ' + req.method + ' ' + req.url);
            const used = process.memoryUsage().heapUsed / 1024 / 1024;
            console.log(new Date().toLocaleString() + ': memory used approximately ' + Math.round(used * 100) / 100 + ' MB');
            req.url = req.url.replace(/\/{2,}/g, '/'); // Normalize URL to handle multiple slashes
            next();
        };
        this.app.use(log);

        // Configure CORS Middleware to allow requests from enabled domains (or all, in debug mode)
        if (this.debug) {
            this.app.use(cors());
        } else if (this.allowedOrigins) {
            const allowedOrigins = this.allowedOrigins.split(',');
            const corsOptions = {
                origin: allowedOrigins, 
                methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
                credentials: true
            };
            this.app.use(cors(corsOptions));
        }
        // Protect against common web vulnerabilities (e.g., DDOS, Brute Force, XSS)
        this.app.use(helmet());
    }
    
    /**
     * Initializes and registers a Middleware service, if enabled in the configuration.
     * @param {ServiceBase} service The service class to register.
     * @returns {void} 
     */
    registerService(service: any): void {
        const Service = new service(); // Instantiate the service
        try {
            if (this.settings[Service.name]?.Enabled) { // Check if service is enabled in settings
                Service.init(this); // Initialize the service with server context
                this.app.use(this.path + Service.path, Service.router); // Register service router
                console.log(new Date().toLocaleString() + ': ' + this.path + Service.path + ' route added');
            }
        } catch(error) {
            console.log(new Date().toLocaleString() + ': cannot add route ' + this.path + Service.path, error);
        }
    }

    /**
     * Starts the server.
     * @returns {void}
     */
    start(): void {
        // Start the Middleware
        try {
            if (this.https) {
                // Run in HTTPS standalone mode (e.g., directly exposed or within a Docker container)
                https.createServer(this.ssl, this.app).listen(process.env.PORT || this.port, () => {
                    console.log(this.title + ' is listening on https port ' + (process.env.PORT || this.port));
                })
            } else {
                // Run in HTTP standalone mode (e.g., directly exposed or within a Docker container)
                // or listening internally behind a reverse proxy (e.g., Nginx, Apache, IIS)
                this.app.listen(process.env.PORT || this.port, () => {
                    console.log(this.title + ' is listening on port ' + (process.env.PORT || this.port));
                })
            }    
        } catch (error) {
            console.log(error);
        }
    }
}

export { 
    ServerBase 
};
