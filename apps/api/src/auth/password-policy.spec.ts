import { AppError } from '../common/app-error';
import { assertPasswordPolicy, MIN_PASSWORD_LENGTH } from './password-policy';

describe('password policy', () => {
  it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(() => assertPasswordPolicy('short', 'ops')).toThrow(AppError);
    try {
      assertPasswordPolicy('admin', 'admin');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PASSWORD_TOO_WEAK' });
    }
  });

  it('rejects a password that matches the account name', () => {
    expect(() => assertPasswordPolicy('Administrator', 'administrator')).toThrow(AppError);
  });

  it('accepts a sufficiently long distinct password', () => {
    expect(() => assertPasswordPolicy('correct-horse-battery', 'admin')).not.toThrow();
  });
});
