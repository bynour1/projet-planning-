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
});
