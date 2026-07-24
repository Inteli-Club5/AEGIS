import express from 'express';
import * as serviceController from '../controllers/serviceController';

const router = express.Router();

// Service routes
router.get('/list', serviceController.listServices);
router.post('/query', serviceController.sendQuery);
router.post('/settle-fee', serviceController.settleFee);
router.post('/acknowledge-provider', serviceController.acknowledgeProvider);
router.post('/transfer-to-provider', serviceController.transferToProvider);

export default router; 