/**
 * Services Module.
 * @module defs/service
 */

import { RequestHandler, Request, Response, Router, NextFunction } from 'express';
import { Worker } from 'worker_threads';
import { NextHandleFunction } from "connect";
import bodyParser from 'body-parser';
import { TWorkerData, TWorkerCallback } from './defs';
import { ServerBase } from './server'; 

interface IServiceBase {
    server: ServerBase;
    name: string;
    title: string;
    router: Router;
    auth: boolean;
    workerFile: string;
    path: string;
    urlencodedParser: NextHandleFunction;
    init: (server: ServerBase) => void;
    createRequestHandler: (endpoint: string, callback: TWorkerCallback) => RequestHandler;
    raiseHTTPError: (res: Response, error: any, errorNumber: number) => void;
}

/**
 * Service Base Class
 * @class
 */
class ServiceBase implements IServiceBase {
    /**
     * The Server object where this service is registered.
     * @property {ServerBase} server 
     */
    server: ServerBase;
    /**
     * The name of the service.
     * @property {string} name
     */
    name: string;
    /**
     * A description or title for the service.
     * @property {string} title
     */
    title: string;
    /**
     * The Express Router managing the service's routes.
     * @property {Router} router 
     */
    router: Router;
    /**
     * Indicates if authentication is required for this service.
     * @property {boolean} auth
     */
    auth: boolean;
    /**
     * Parser for URL-encoded bodies in incoming requests.
     * @property {NextHandleFunction} urlencodedParser 
     */
    urlencodedParser: NextHandleFunction;

    constructor() {
        this.server = null;
        this.name = null;
        this.title = null;
        this.router = null;
        this.auth = false;
        this.urlencodedParser = null;
    }

    /**
     * The filename of the associated worker.
     * @property {string} workerFile
     */
    public get workerFile() {
        return 'worker_' + this.name.toLowerCase() + '.js';
    }

    /**
     * The base path (URL segment) for this service.
     * @property {string} path
     */
    public get path() {
        return '/' + this.name.toLowerCase();
    }

    /**
     * Initializes a Middleware service.
     * This method sets up the service's route manager (router) and a body parser (bodyParser)
     * for URL-encoded requests, to be used as needed. It also adds a default test route
     * at the root of the service, without involving a parallel worker thread.
     * Derived classes should add their specific routes here using {@link createRequestHandler},
     * specifying the relevant worker endpoint for the task and the callback to generate the service response.
     * @param {ServerBase} server The server object where this service is registered.
     * @returns {void} 
     */
    init(server: ServerBase): void { 
        this.server = server;
        this.router = Router();
        this.urlencodedParser = bodyParser.urlencoded({ extended: false });
    
        if (this.auth) {
            // If the service requires authentication, incoming requests must
            // provide the API Key in the HTTP headers (e.g., 'x-api-key').
            const checkAPIKey: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
                if (req.headers['x-api-key'] === process.env.MIDDLEWARE_API_KEY) // Changed from _2G_
                    next();
                else
                    this.raiseHTTPError(res, 'Forbidden: Invalid Middleware API Key', 403);
            };
            this.router.use(checkAPIKey);
        }

        // Default service health check route
        const checkState: RequestHandler = (req: Request, res: Response) => {
            res.status(200).send(this.title + ': the service is active.');
        };
        this.router.get('/', checkState);
    }

    /**
     * Default handler for service routes.
     * This handler executes the service's worker, passing the HTTP request data
     * and the worker's endpoint (method) to be executed. It then invokes the callback
     * and terminates the worker thread as soon as a message is received.
     * @param {string} endpoint The name of the worker method to execute for this route.
     * @param {TWorkerCallback} callback The callback to execute upon worker completion.
     * @returns {RequestHandler} 
     */
    createRequestHandler(endpoint: string, callback: TWorkerCallback): RequestHandler {
        const service = this;

        const handler: RequestHandler = async (req: Request, res: Response) => {
            const workerData: TWorkerData = {
                endpoint: endpoint,
                settings: service.server.settings,
                name: service.name,
                debug: service.server.debug,
                headers: req.headers,
                body: req.body,
                query: req.query
            }

            const w = new Worker('./' + service.workerFile, { 
                workerData: workerData
            });

            w.once("message", (value: any) => {
                try {
                    callback(req, res, value);
                } finally {
                    w.terminate();
                    if (service.server.debug)
                        console.log(new Date().toLocaleString() + ' <' + endpoint + '> endpoint terminated');
                }
            });
    
            w.once("error", (error: any) => {
                service.raiseHTTPError(res, error);
            });       
        }

        return handler;
    };

    /**
     * Raises an HTTP error.
     * @param {Response} res The Response object to send the error through.
     * @param {any} error The error message or object.
     * @param {number} [errorNumber=500] The HTTP status code for the error.
     * @returns {void} 
     */
    raiseHTTPError(res: Response, error: any, errorNumber: number = 500): void { 
        const text = this.title + ': ' + (typeof error === 'string' ? error : error?.message);
        if (this.server.debug)
            console.log(new Date().toLocaleString() + ' ' + text);
        res.status(errorNumber).send(text);
    }
}

export { 
    ServiceBase 
};
