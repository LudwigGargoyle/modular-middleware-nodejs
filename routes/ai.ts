/**
 * AI Services Module.
 * @module routes/ai 
 */

import { Request, Response } from 'express';
// For showcase purposes, defining types directly here for clarity,
// as defs.ts is not published
type TAiChatData = {
    answer: string;
    total_tokens?: number;
};

type TWorkerCallback = (request: Request, response: Response, value: TAiChatData | string) => void;


import { ServerBase } from '../defs/server';
import { ServiceBase } from '../defs/service';

/**
 * AI Services Class
 * This class handles routing for various AI functionalities.
 * Routes/Endpoints:
 * - **OpenAI:** Submits a question to OpenAI's ChatGPT.
 * - **Google:** Submits a question to Google's Gemini.
 *  **Dialogflow:** Submits a question to Dialogflow for intent and entity detection.
 * @class
 */
class AiService extends ServiceBase {
    
    constructor() {
        super();
        this.name = 'AI';
        this.title = 'AI Integration Service for Enterprise Applications'; // Using the suggested generic title
        this.auth = true;
    }

    /**
     * Initializes the AI service and registers its specific routes.
     * Overrides the base `init` method to add AI-specific routing logic.
     * @param {ServerBase} server The server instance this service is registered with.
     * @returns {void}
     */
    init(server: ServerBase) {
        super.init(server); // Call the base class's init method first
        
        // Define supported AI services based on configuration
        const supportedServices = ['OpenAI', 'Google'];
        // Check if the configured AI service is supported
        if (supportedServices.indexOf(this.server.settings[this.name].Service) < 0) {
            throw new Error('Unsupported AI service configured: ' + this.server.settings[this.name].Service);
        }
    
        // Handler for generic AI Chat requests (e.g., OpenAI, Google Gemini)
        const chatCallback: TWorkerCallback = (req: Request, res: Response, answer: TAiChatData) => {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(answer));
        };
        // Register POST route for generic AI chat, dispatching to configured service
        this.router.post('/chat', this.urlencodedParser, this.createRequestHandler(this.server.settings[this.name].Service, chatCallback));

        // Handler for Dialogflow requests
        const dialogflowCallback: TWorkerCallback = (req: Request, res: Response, answer: string) => {
            res.set('Content-Type', 'application/json');
            res.send(JSON.stringify(answer));
        };
        // Register POST route for Dialogflow-specific interaction
        this.router.post('/dialogflow', this.urlencodedParser, this.createRequestHandler('Dialogflow', dialogflowCallback));
    }
}

export default AiService;
