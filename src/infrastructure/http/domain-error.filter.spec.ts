import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
import { DomainError } from '@/shared/domain.error';

class FakeError extends DomainError {
  constructor(readonly code: string) {
    super(`fake error: ${code}`);
  }
}

describe('DomainErrorFilter', () => {
  let sut: DomainErrorFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    sut = new DomainErrorFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('mapeia SESSION_NOT_FOUND para 404', () => {
    sut.catch(new FakeError('SESSION_NOT_FOUND'), host);
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('mapeia SESSION_EXPIRED para 401', () => {
    sut.catch(new FakeError('SESSION_EXPIRED'), host);
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it('mapeia SESSION_ALREADY_REVOKED para 409', () => {
    sut.catch(new FakeError('SESSION_ALREADY_REVOKED'), host);
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });

  it('usa 422 como default para erro de domínio não mapeado', () => {
    sut.catch(new FakeError('SOME_UNMAPPED_ERROR'), host);
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('inclui code e message no corpo da resposta', () => {
    const error = new FakeError('SESSION_EXPIRED');
    sut.catch(error, host);
    expect(jsonMock).toHaveBeenCalledWith({
      code: 'SESSION_EXPIRED',
      message: error.message,
    });
  });
});
