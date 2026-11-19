/**
 * tests/mailer.test.js
 * Tests pour la configuration mailer (Mode Gmail Dédié vs Mode Brevo Standard)
 */

describe('Mailer Configuration & Modes (Gmail Dédié vs Brevo)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Mode Gmail Dédié (EMAIL_PROVIDER=gmail)', () => {
    it('affiche l\'avertissement exact au démarrage : "Mode Gmail dédié : usage interne, ~500 emails/jour"', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'interne.gmt@gmail.com';
      process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
      process.env.EMAIL_FROM = 'interne.gmt@gmail.com';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mode Gmail dédié : usage interne, ~500 emails/jour')
      );
      warnSpy.mockRestore();
    });

    it('n\'exige PAS EMAIL_HOST en mode gmail (EMAIL_HOST absent ou vide est accepté)', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_HOST = ''; // Aucun EMAIL_HOST
      process.env.EMAIL_USER = 'interne.gmt@gmail.com';
      process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
      process.env.EMAIL_FROM = 'interne.gmt@gmail.com';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).not.toThrow();
      warnSpy.mockRestore();
    });

    it('désactive le blocage des adresses @gmail.com (validateMailerConfig ne lève pas d\'erreur)', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'mon.cabinet.gmt@gmail.com';
      process.env.EMAIL_PASS = 'secretpass1234';
      process.env.EMAIL_FROM = '"GMT Ariana" <mon.cabinet.gmt@gmail.com>';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).not.toThrow();
      warnSpy.mockRestore();
    });

    it('lève une erreur claire en production si EMAIL_USER ou EMAIL_PASS est manquant', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = '';
      process.env.EMAIL_PASS = '';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/Variables d'environnement email manquantes en production \(mode Gmail\)/);
      errSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('lève une erreur claire en production si EMAIL_PASS manque uniquement', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'interne.gmt@gmail.com';
      process.env.EMAIL_PASS = '';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/EMAIL_PASS/);
      errSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('affiche un avertissement si EMAIL_FROM a une adresse différente de EMAIL_USER', () => {
      process.env.NODE_ENV = 'development';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'expediteur.reel@gmail.com';
      process.env.EMAIL_PASS = 'secretpass1234';
      process.env.EMAIL_FROM = '"GMT Ariana" <autre.adresse@gmail.com>';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      validateMailerConfig();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Gmail impose que l\'expéditeur corresponde à EMAIL_USER')
      );
      warnSpy.mockRestore();
    });

    it('n\'affiche PAS d\'avertissement si EMAIL_FROM a la même adresse que EMAIL_USER', () => {
      process.env.NODE_ENV = 'development';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'meme.adresse@gmail.com';
      process.env.EMAIL_PASS = 'secretpass1234';
      process.env.EMAIL_FROM = '"GMT Ariana" <meme.adresse@gmail.com>';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      validateMailerConfig();

      const diffWarning = warnSpy.mock.calls.some(call =>
        call[0] && call[0].includes('a une adresse différente')
      );
      expect(diffWarning).toBe(false);
      warnSpy.mockRestore();
    });

    it('force Expéditeur = EMAIL_USER dans getFromAddress même si EMAIL_FROM a une autre adresse', () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'reel.expediteur@gmail.com';
      process.env.EMAIL_FROM = '"Mon Cabinet" <autre@yahoo.fr>';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { getFromAddress } = require('../config/mailer');
      const from = getFromAddress('Planning');

      expect(from).toBe('"Mon Cabinet" <reel.expediteur@gmail.com>');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Gmail impose que l\'expéditeur corresponde à EMAIL_USER')
      );
      warnSpy.mockRestore();
    });

    it('utilise EMAIL_USER si EMAIL_FROM n\'est pas renseigné', () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'service.medical@gmail.com';
      process.env.EMAIL_FROM = '';

      const { getFromAddress } = require('../config/mailer');
      const from = getFromAddress('Planning');
      expect(from).toBe('"GMT Ariana — Planning" <service.medical@gmail.com>');
    });

    it('crée un transport Nodemailer avec service: "gmail" et n\'affiche jamais EMAIL_PASS dans les logs', () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'service.medical@gmail.com';
      process.env.EMAIL_PASS = 'super-secret-app-password';

      const nodemailer = require('nodemailer');
      const createTransportSpy = jest.spyOn(nodemailer, 'createTransport');

      const { getTransporter } = require('../config/mailer');
      const transporter = getTransporter();

      expect(createTransportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'gmail',
          auth: {
            user: 'service.medical@gmail.com',
            pass: 'super-secret-app-password',
          },
        })
      );
      expect(transporter).toBeDefined();

      createTransportSpy.mockRestore();
    });

    it('ne fait fuiter EMAIL_PASS dans aucun log console (console.log/warn/error)', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'test.logs@gmail.com';
      const secretPassword = 'MOT_DE_PASSE_ULTRA_CONFIDENTIEL_16_CAR';
      process.env.EMAIL_PASS = secretPassword;
      process.env.EMAIL_FROM = 'test.logs@gmail.com';

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { validateMailerConfig, getFromAddress } = require('../config/mailer');
      validateMailerConfig();
      getFromAddress('Test');

      const allCalls = [
        ...logSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
        ...errSpy.mock.calls.flat(),
      ];

      const leaked = allCalls.some(item => typeof item === 'string' && item.includes(secretPassword));
      expect(leaked).toBe(false);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe('Mode Brevo Standard (sans EMAIL_PROVIDER ou EMAIL_PROVIDER=brevo)', () => {
    it('garde le comportement Brevo actuel et bloque les adresses @gmail.com en production', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = ''; // Sans EMAIL_PROVIDER
      process.env.EMAIL_HOST = 'smtp-relay.brevo.com';
      process.env.EMAIL_USER = 'brevo_login';
      process.env.EMAIL_PASS = 'brevo_pass';
      process.env.EMAIL_FROM = '"GMT Ariana" <personnel@gmail.com>';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/ne peut pas être une adresse personnelle/);
      errSpy.mockRestore();
    });

    it('exige EMAIL_HOST en production en mode Brevo standard', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = '';
      process.env.EMAIL_HOST = ''; // EMAIL_HOST manquant
      process.env.EMAIL_USER = 'brevo_login';
      process.env.EMAIL_PASS = 'brevo_pass';
      process.env.EMAIL_FROM = '"GMT Ariana" <no-reply@gmt-ariana.tn>';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/EMAIL_HOST/);
      errSpy.mockRestore();
    });

    it('accepte les adresses de domaine professionnel certifié', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo';
      process.env.EMAIL_HOST = 'smtp-relay.brevo.com';
      process.env.EMAIL_USER = 'brevo_login';
      process.env.EMAIL_PASS = 'brevo_pass';
      process.env.EMAIL_FROM = '"GMT Ariana" <no-reply@gmt-ariana.tn>';

      const { validateMailerConfig } = require('../config/mailer');
      expect(() => validateMailerConfig()).not.toThrow();
    });
  });

  describe('Mode Brevo API HTTPS (EMAIL_PROVIDER=brevo-api)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('valide la configuration en production avec BREVO_API_KEY et EMAIL_FROM', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = 'xkeysib-test-key-12345';
      process.env.EMAIL_FROM = '"GMT Ariana" <contact@gmt-ariana.tn>';

      const { validateMailerConfig } = require('../config/mailer');
      expect(() => validateMailerConfig()).not.toThrow();
    });

    it('n\'exige PAS EMAIL_HOST, EMAIL_USER ni EMAIL_PASS en mode brevo-api', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.EMAIL_HOST = '';
      process.env.EMAIL_USER = '';
      process.env.EMAIL_PASS = '';
      process.env.BREVO_API_KEY = 'xkeysib-test-key-12345';
      process.env.EMAIL_FROM = 'contact@gmt-ariana.tn';

      const { validateMailerConfig } = require('../config/mailer');
      expect(() => validateMailerConfig()).not.toThrow();
    });

    it('lève une erreur claire en production si BREVO_API_KEY manque', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = '';
      process.env.EMAIL_FROM = 'contact@gmt-ariana.tn';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/BREVO_API_KEY/);
      errSpy.mockRestore();
    });

    it('lève une erreur claire en production si EMAIL_FROM manque', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = 'xkeysib-test-key-12345';
      process.env.EMAIL_FROM = '';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/EMAIL_FROM/);
      errSpy.mockRestore();
    });

    it('formate correctement l\'expéditeur EMAIL_FROM dans getFromAddress', () => {
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.EMAIL_FROM = '"Service Médical" <contact@gmt-ariana.tn>';

      const { getFromAddress } = require('../config/mailer');
      const from = getFromAddress('Administration');
      expect(from).toBe('"Service Médical" <contact@gmt-ariana.tn>');
    });

    it('ne fait fuiter BREVO_API_KEY dans aucun log console', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo-api';
      const secretApiKey = 'xkeysib-SECRET-KEY-BREVO-99999999';
      process.env.BREVO_API_KEY = secretApiKey;
      process.env.EMAIL_FROM = 'contact@gmt-ariana.tn';

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { validateMailerConfig, getFromAddress } = require('../config/mailer');
      validateMailerConfig();
      getFromAddress('Test');

      const allCalls = [
        ...logSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
        ...errSpy.mock.calls.flat(),
      ];

      const leaked = allCalls.some(item => typeof item === 'string' && item.includes(secretApiKey));
      expect(leaked).toBe(false);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
    });

    it('envoie un email via l\'API HTTP Brevo (POST https://api.brevo.com/v3/smtp/email) sans SMTP', async () => {
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = 'xkeysib-test-secret-12345';
      process.env.EMAIL_FROM = '"GMT Ariana" <contact@gmt-ariana.tn>';

      const mockFetch = jest.fn();
      // 1er appel: verify() sur /v3/account
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ email: 'contact@gmt-ariana.tn', firstName: 'GMT' }),
      });
      // 2eme appel: sendMail() sur /v3/smtp/email
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<brevo-msg-123@api.brevo.com>' }),
      });

      global.fetch = mockFetch;

      const { getTransporterAsync } = require('../config/mailer');
      const { transporter } = await getTransporterAsync();

      const result = await transporter.sendMail({
        from: '"GMT Ariana" <contact@gmt-ariana.tn>',
        to: 'patient@exemple.com',
        subject: 'Votre rendez-vous',
        text: 'Confirmation de RDV',
        html: '<p>Confirmation de RDV</p>',
      });

      expect(result.messageId).toBe('<brevo-msg-123@api.brevo.com>');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(options.method).toBe('POST');
      expect(options.headers['api-key']).toBe('xkeysib-test-secret-12345');
      expect(options.headers['content-type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.sender).toEqual({ name: 'GMT Ariana', email: 'contact@gmt-ariana.tn' });
      expect(body.to).toEqual([{ email: 'patient@exemple.com' }]);
      expect(body.subject).toBe('Votre rendez-vous');
      expect(body.htmlContent).toBe('<p>Confirmation de RDV</p>');
      expect(body.textContent).toBe('Confirmation de RDV');
    });

    it('gère les erreurs retournées par l\'API Brevo sans exposer la clé', async () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = 'xkeysib-invalid-key';
      process.env.EMAIL_FROM = 'contact@gmt-ariana.tn';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'unauthorized', message: 'Key not found' }),
      });
      global.fetch = mockFetch;

      const { getTransporterAsync } = require('../config/mailer');
      await expect(getTransporterAsync()).rejects.toThrow(/Key not found/);
    });

    it('exécute testEmailConnection avec succès en mode brevo_api', async () => {
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = 'xkeysib-valid-key';
      process.env.EMAIL_FROM = '"GMT Ariana" <contact@gmt-ariana.tn>';

      const mockFetch = jest.fn();
      // 1er appel: verify() dans getTransporterAsync()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ email: 'contact@gmt-ariana.tn' }),
      });
      // 2ème appel: sendMail() sur /v3/smtp/email
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<test-msg-id@brevo>' }),
      });

      global.fetch = mockFetch;

      const { testEmailConnection } = require('../config/mailer');
      const res = await testEmailConnection('testeur@gmt.tn');

      expect(res.ok).toBe(true);
      expect(res.sent).toBe(true);
      expect(res.mode).toBe('brevo_api');
      expect(res.messageId).toBe('<test-msg-id@brevo>');
    });

    it('exécute testEmailConnection sans destinataire (vérification identifiants)', async () => {
      process.env.EMAIL_PROVIDER = 'brevo-api';
      process.env.BREVO_API_KEY = 'xkeysib-valid-key';
      process.env.EMAIL_FROM = '"GMT Ariana" <contact@gmt-ariana.tn>';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ email: 'contact@gmt-ariana.tn' }),
      });

      global.fetch = mockFetch;

      const { testEmailConnection } = require('../config/mailer');
      const res = await testEmailConnection();

      expect(res.ok).toBe(true);
      expect(res.configured).toBe(true);
      expect(res.mode).toBe('brevo_api');
    });
  });

  describe('Mode Resend API HTTPS (EMAIL_PROVIDER=resend)', () => {
    it('valide la configuration en production avec RESEND_API_KEY et EMAIL_FROM', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_test_key_12345';
      process.env.EMAIL_FROM = 'contact@gmt-ariana.tn';

      const { validateMailerConfig } = require('../config/mailer');
      expect(() => validateMailerConfig()).not.toThrow();
    });

    it('lève une erreur claire en production si RESEND_API_KEY manque', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = '';
      process.env.EMAIL_FROM = 'contact@gmt-ariana.tn';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/RESEND_API_KEY/);
      errSpy.mockRestore();
    });
  });
});

