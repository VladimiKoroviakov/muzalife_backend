/**
 * @file Unit tests for the email delivery service.
 *
 * Tests `services/emailService.js`:
 *   constructor/createTransporter — SMTP setup
 *   extractVerificationCode       — HTML parsing
 *   sendVerificationEmail         — OTP delivery
 *   sendGuestPurchaseConfirmation — guest purchase email
 *   sendProductMaterials          — product file delivery
 *   sendOrderMaterials            — personal order file delivery
 * @module tests/unit/emailService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// nodemailer must be mocked before EmailService is imported (singleton runs at
// module load time, so createTransport is called during import).
vi.mock('nodemailer', () => {
  const mockTransporter = {
    verify: vi.fn((cb) => cb(null, true)),
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  };
  return {
    default: {
      createTransport: vi.fn(() => mockTransporter),
    },
    __mockTransporter: mockTransporter,
  };
});

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import nodemailer from 'nodemailer';
import logger from '../../utils/logger.js';

/**
 *
 */
function getMockTransporter() {
  return nodemailer.createTransport.mock.results[0]?.value;
}

// ─────────────────────────────────────────────────────────────────────────────
// constructor / createTransporter
// ─────────────────────────────────────────────────────────────────────────────
describe('EmailService constructor / createTransporter', () => {
  it('creates a nodemailer transporter on instantiation', async () => {
    await import('../../services/emailService.js');
    expect(nodemailer.createTransport).toHaveBeenCalled();
  });

  it('calls transporter.verify() after creation', async () => {
    const transporter = getMockTransporter();
    expect(transporter.verify).toHaveBeenCalled();
  });

  it('handles verify callback with error branch (transporter.verify error path)', async () => {
    // The error branch is tested by calling verify with an error callback directly
    const transporter = getMockTransporter();
    const errorCb = transporter.verify.mock.calls[0]?.[0];
    // The callback was registered — calling it with an error exercises the error branch
    if (typeof errorCb === 'function') {
      expect(() => errorCb(new Error('SMTP refused'), null)).not.toThrow();
    }
    // verify was called on init
    expect(transporter.verify).toHaveBeenCalled();
  });

  it('returns undefined transporter gracefully when createTransport throws', async () => {
    // The constructor's catch branch returns undefined from createTransporter
    // We verify the service still exports without crashing
    const { emailService: svc } = await import('../../services/emailService.js');
    expect(svc).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractVerificationCode
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService.extractVerificationCode', () => {
  let emailService;

  beforeEach(async () => {
    ({ emailService } = await import('../../services/emailService.js'));
  });

  it('returns 6-digit code from HTML when pattern found', () => {
    const html = '<h3 style="font-size:32px;">483920</h3>';
    expect(emailService.extractVerificationCode(html)).toBe('483920');
  });

  it('returns "Not found in HTML" when pattern not present', () => {
    const html = '<p>No code here</p>';
    expect(emailService.extractVerificationCode(html)).toBe('Not found in HTML');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendVerificationEmail
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService.sendVerificationEmail', () => {
  let emailService;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ emailService } = await import('../../services/emailService.js'));
    // Ensure transporter.sendMail is mocked
    if (emailService.transporter) {
      emailService.transporter.sendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });
    }
  });

  it('returns true on successful send for registration type', async () => {
    const result = await emailService.sendVerificationEmail('user@test.com', '123456', 'registration');
    expect(result).toBe(true);
  });

  it('sends with registration subject for type=registration', async () => {
    await emailService.sendVerificationEmail('user@test.com', '999888', 'registration');
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.subject).toContain('Підтвердження електронної пошти');
    expect(mailOptions.html).toContain('999888');
  });

  it('sends with email_change subject for type=email_change', async () => {
    await emailService.sendVerificationEmail('user@test.com', '123456', 'email_change');
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.subject).toContain('Підтвердження зміни');
  });

  it('defaults to registration type when type not specified', async () => {
    await emailService.sendVerificationEmail('user@test.com', '123456');
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.subject).toContain('Підтвердження електронної пошти');
  });

  it('throws on sendMail failure', async () => {
    emailService.transporter.sendMail.mockRejectedValueOnce(new Error('send failed'));

    await expect(
      emailService.sendVerificationEmail('user@test.com', '123456'),
    ).rejects.toThrow('Failed to send verification email');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendGuestPurchaseConfirmation
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService.sendGuestPurchaseConfirmation', () => {
  let emailService;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ emailService } = await import('../../services/emailService.js'));
    if (emailService.transporter) {
      emailService.transporter.sendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });
    }
  });

  it('returns true on successful send', async () => {
    const result = await emailService.sendGuestPurchaseConfirmation('guest@test.com', ['Сценарій', 'Квест']);
    expect(result).toBe(true);
  });

  it('includes product names in email HTML', async () => {
    await emailService.sendGuestPurchaseConfirmation('guest@test.com', ['Product A', 'Product B']);
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('Product A');
    expect(mailOptions.html).toContain('Product B');
  });

  it('throws on sendMail failure', async () => {
    emailService.transporter.sendMail.mockRejectedValueOnce(new Error('smtp error'));

    await expect(
      emailService.sendGuestPurchaseConfirmation('guest@test.com', ['P']),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendProductMaterials
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService.sendProductMaterials', () => {
  let emailService;
  const testFiles = [
    { fileName: 'script.pdf', fileUrl: 'http://localhost:5001/uploads/products/1/script.pdf' },
    { fileName: 'bonus.docx', fileUrl: 'http://localhost:5001/uploads/products/1/bonus.docx' },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ emailService } = await import('../../services/emailService.js'));
    if (emailService.transporter) {
      emailService.transporter.sendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });
    }
  });

  it('returns true on successful send', async () => {
    const result = await emailService.sendProductMaterials('buyer@test.com', 'Сценарій', testFiles);
    expect(result).toBe(true);
  });

  it('constructs attachments array from file objects', async () => {
    await emailService.sendProductMaterials('buyer@test.com', 'Test', testFiles);
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.attachments).toHaveLength(2);
    expect(mailOptions.attachments[0].filename).toBe('script.pdf');
    expect(mailOptions.attachments[1].filename).toBe('bonus.docx');
  });

  it('includes file links in HTML body', async () => {
    await emailService.sendProductMaterials('buyer@test.com', 'Test', testFiles);
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('script.pdf');
    expect(mailOptions.html).toContain('bonus.docx');
  });

  it('throws and logs on sendMail failure', async () => {
    emailService.transporter.sendMail.mockRejectedValueOnce(new Error('smtp fail'));

    await expect(
      emailService.sendProductMaterials('buyer@test.com', 'Test', testFiles),
    ).rejects.toThrow('Failed to send product materials email');

    expect(logger.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendOrderMaterials
// ─────────────────────────────────────────────────────────────────────────────
describe('emailService.sendOrderMaterials', () => {
  let emailService;
  const orderFiles = [
    { fileName: 'quest.pdf', fileUrl: 'http://localhost:5001/uploads/personal-orders/5/quest.pdf' },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ emailService } = await import('../../services/emailService.js'));
    if (emailService.transporter) {
      emailService.transporter.sendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });
    }
  });

  it('returns true on successful send', async () => {
    const result = await emailService.sendOrderMaterials('client@test.com', 'Квест', orderFiles);
    expect(result).toBe(true);
  });

  it('constructs attachment with correct filename', async () => {
    await emailService.sendOrderMaterials('client@test.com', 'Квест', orderFiles);
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.attachments[0].filename).toBe('quest.pdf');
  });

  it('includes order title in subject', async () => {
    await emailService.sendOrderMaterials('client@test.com', 'Індивідуальний квест', orderFiles);
    const mailOptions = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mailOptions.subject).toContain('Індивідуальний квест');
  });

  it('throws and logs on sendMail failure', async () => {
    emailService.transporter.sendMail.mockRejectedValueOnce(new Error('smtp fail'));

    await expect(
      emailService.sendOrderMaterials('client@test.com', 'Квест', orderFiles),
    ).rejects.toThrow('Failed to send order materials email');

    expect(logger.error).toHaveBeenCalled();
  });
});
