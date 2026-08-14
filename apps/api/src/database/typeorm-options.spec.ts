import dataSource, { cliTypeormOptions } from './data-source';
import { typeormOptions } from './typeorm-options';

describe('TypeORM migration modes', () => {
  it('runs migrations at Nest startup but never implicitly from CLI initialization', () => {
    expect(typeormOptions.migrationsRun).toBe(true);
    expect(cliTypeormOptions.migrationsRun).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
  });
});
