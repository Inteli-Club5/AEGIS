import { Request, Response } from 'express';
import { brokerService } from '../services/brokerService';

/**
 * Helper function to convert BigInt values to strings in an object
 */
const convertBigIntToString = (data: any): any => {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'bigint') {
    return data.toString();
  }
  
  if (Array.isArray(data)) {
    return data.map(item => convertBigIntToString(item));
  }
  
  if (typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      result[key] = convertBigIntToString(data[key]);
    }
    return result;
  }
  
  return data;
};

/**
 * @swagger
 * /services/list:
 *   get:
 *     summary: List available AI services
 *     tags: [Services]
 *     responses:
 *       200:
 *         description: List of available services
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 services:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       model:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       serviceType:
 *                         type: string
 *                       url:
 *                         type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
export const listServices = async (req: Request, res: Response) => {
  try {
    
    const services = await brokerService.listServices();
    
    // Convert BigInt values to strings
    const serializedServices = convertBigIntToString(services);
    
    return res.status(200).json({
      success: true,
      services: serializedServices
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * @swagger
 * /services/query:
 *   post:
 *     summary: Send a query to an AI service
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerAddress
 *               - query
 *             properties:
 *               providerAddress:
 *                 type: string
 *                 description: Provider address
 *               query:
 *                 type: string
 *                 description: Query text
 *               fallbackFee:
 *                 type: number
 *                 description: Optional fallback fee
 *     responses:
 *       200:
 *         description: Query response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 response:
 *                   type: object
 *                   properties:
 *                     content:
 *                       type: string
 *                     metadata:
 *                       type: object
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
export const sendQuery = async (req: Request, res: Response) => {
  try {
    
    const { providerAddress, query, fallbackFee } = req.body;
    
    if (!providerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Provider address is required'
      });
    }
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query text is required'
      });
    }
    
    let parsedFallbackFee = undefined;
    if (fallbackFee) {
      parsedFallbackFee = Number(fallbackFee);
      if (isNaN(parsedFallbackFee) || parsedFallbackFee <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid fallback fee amount'
        });
      }
    }
    
    const result = await brokerService.sendQuery(providerAddress, query, parsedFallbackFee);
    
    // Convert BigInt values to strings
    const serializedResult = convertBigIntToString(result);
    
    return res.status(200).json({
      success: true,
      response: serializedResult
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}; 


/**
 * @swagger
 * /services/settle-fee:
 *   post:
 *     summary: Manually settle a fee, only if the fee is not settled when the query is sent
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerAddress
 *               - fee
 *             properties:
 *               providerAddress:
 *                 type: string
 *                 description: Provider address
 *               fee:
 *                 type: number
 *                 description: Fee amount
 *     responses:
 *       200:
 *         description: Fee settled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
export const settleFee = async (req: Request, res: Response) => {
  try {
    
    const { providerAddress, fee } = req.body;
    
    if (!providerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Provider address is required'
      });
    }
    
    if (!fee || isNaN(fee) || fee <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid fee amount is required'
      });
    }
    
    const result = await brokerService.settleFee(providerAddress, Number(fee));
    
    return res.status(200).json({
      success: true,
      message: result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * @swagger
 * /services/acknowledge-provider:
 *   post:
 *     summary: Acknowledge a provider before using their services (Step 1 of 2)
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerAddress
 *             properties:
 *               providerAddress:
 *                 type: string
 *                 description: Provider address to acknowledge
 *     responses:
 *       200:
 *         description: Provider acknowledged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
export const acknowledgeProvider = async (req: Request, res: Response) => {
  try {
    const { providerAddress } = req.body;

    if (!providerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Provider address is required'
      });
    }

    const result = await brokerService.acknowledgeProvider(providerAddress);

    return res.status(200).json({
      success: true,
      message: result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * @swagger
 * /services/transfer-to-provider:
 *   post:
 *     summary: Transfer funds to a provider (Step 2 of 2 - REQUIRED before queries)
 *     description: Each provider requires a minimum of 1 OG transferred before you can use their services
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerAddress
 *               - amount
 *             properties:
 *               providerAddress:
 *                 type: string
 *                 description: Provider address to transfer funds to
 *               amount:
 *                 type: number
 *                 description: Amount in OG tokens (minimum 1.0 recommended)
 *                 minimum: 1.0
 *     responses:
 *       200:
 *         description: Funds transferred successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
export const transferToProvider = async (req: Request, res: Response) => {
  try {
    const { providerAddress, amount } = req.body;

    if (!providerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Provider address is required'
      });
    }

    if (!amount || isNaN(amount) || amount < 1.0) {
      return res.status(400).json({
        success: false,
        error: 'Valid amount is required (minimum 1.0 OG)'
      });
    }

    const result = await brokerService.transferFundsToProvider(providerAddress, Number(amount));

    return res.status(200).json({
      success: true,
      message: result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};