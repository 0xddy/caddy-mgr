import type { Request } from 'express';
import type { AdminEntity, SessionEntity } from '../database/entities';

export interface AuthenticatedRequest extends Request {
  admin: AdminEntity;
  session: SessionEntity;
}
