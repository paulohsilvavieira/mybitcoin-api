import { randomBytes } from 'node:crypto';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserRepository } from '@/modules/identity/domain/repositories';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { EmailAlreadyExistsError } from '@/modules/identity/domain/errors/email-already-exists.error';
import { TermsNotAcceptedError } from '@/modules/identity/domain/errors/terms-not-accepted.error';
import { Logger } from '@nestjs/common';
import { RegisterUserInput } from '@/modules/identity/application/dtos/register-user.usecase.input';
import { RegisterUserOutput } from '@/modules/identity/application/dtos/register-user.usecase.output';

export class RegisterUser {
  private readonly logger = new Logger(RegisterUser.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly emailService: EmailService,
    private readonly hashPassword: (plain: string) => Promise<string>,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const startTime = Date.now();

    this.logger.log('User registration started', {
      operation: 'register.user.start',
      email: input.email,
      registrationIp: input.registrationIp,
    });

    const email = Email.create(input.email);

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      this.logger.warn('Registration rejected: email already exists', {
        operation: 'register.user.email.error.already_exists',
        email: input.email,
        reason: 'EMAIL_ALREADY_EXISTS',
        duration_ms: Date.now() - startTime,
      });
      throw new EmailAlreadyExistsError(input.email);
    }

    if (!input.termsAccepted) {
      this.logger.warn('Registration rejected: terms not accepted', {
        operation: 'register_user',
        email: input.email,
        reason: 'TERMS_NOT_ACCEPTED',
        duration_ms: Date.now() - startTime,
      });
      throw new TermsNotAcceptedError();
    }

    const passwordHash = await this.hashPassword(input.password);

    const user = User.create({
      name: input.name,
      email,
      passwordHash,
      termsAccepted: input.termsAccepted,
      registrationIp: input.registrationIp,
    });

    await this.userRepo.save(user);

    this.logger.log('User registration completed', {
      operation: 'register_user',
      userId: user.id.toString(),
      email: input.email,
      duration_ms: Date.now() - startTime,
    });

    const verificationToken = randomBytes(32).toString('hex');
    this.emailService
      .sendVerification({
        to: input.email,
        name: input.name,
        token: verificationToken,
      })
      .catch((error) => {
        this.logger.error(
          'Failed to send verification email',
          error instanceof Error ? error : undefined,
          {
            operation: 'register_user',
            userId: user.id.toString(),
            email: input.email,
          },
        );
      });

    return {
      userId: user.id.toString(),
      email: user.email.toString(),
    };
  }
}
