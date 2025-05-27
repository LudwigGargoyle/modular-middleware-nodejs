/**
 * Worker (Multithreading) Module.
 * @module defs/worker
 */

interface IWorkerBase {
    run: (endpoint: string) => void;
}

/**
 * Worker Base Class
 * @class
 */
class WorkerBase implements IWorkerBase {
    /**
     * Executes a specified endpoint (method) within the worker.
     * Derived worker classes will implement methods corresponding to these endpoints.
     * @param {string} endpoint The name of the worker method to execute.
     * @returns {void} 
     */
    run(endpoint: string): void {
        // Check if the method exists on the worker instance
        if (this[endpoint] && typeof this[endpoint] === 'function') {
            this[endpoint](); // Execute the method
        } else {
            throw new Error(`Unknown endpoint: "${endpoint}". Method not found or not callable on worker.`);
        }
    }
}

export { 
    WorkerBase 
};
