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
    it('permet l\'utilisation d\'une adresse @gmail.com sans lever d\'erreur', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'interne.gmt@gmail.com';
      process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
      process.env.EMAIL_FROM = 'interne.gmt@gmail.com';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mode Gmail dédié : usage interne, environ 500 emails/jour')
      );
      warnSpy.mockRestore();
    });

    it('affiche un avertissement si EMAIL_FROM ne correspond pas à EMAIL_USER', () => {
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

    it('lève une erreur en production si EMAIL_USER ou EMAIL_PASS est manquant', () => {
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

    it('formate correctement l\'expéditeur getFromAddress en mode Gmail dédié', () => {
      process.env.EMAIL_PROVIDER = 'gmail';
      process.env.EMAIL_USER = 'service.medical@gmail.com';
      process.env.EMAIL_FROM = '';

      const { getFromAddress } = require('../config/mailer');
      const from = getFromAddress('Planning');
      expect(from).toBe('"GMT Ariana — Planning" <service.medical@gmail.com>');
    });
  });

  describe('Mode Brevo Standard (EMAIL_PROVIDER non défini ou brevo)', () => {
    it('bloque les adresses @gmail.com en production', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = '';
      process.env.EMAIL_HOST = 'smtp-relay.brevo.com';
      process.env.EMAIL_USER = 'brevo_login';
      process.env.EMAIL_PASS = 'brevo_pass';
      process.env.EMAIL_FROM = '"GMT Ariana" <personnel@gmail.com>';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { validateMailerConfig } = require('../config/mailer');

      expect(() => validateMailerConfig()).toThrow(/ne peut pas être une adresse personnelle/);
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
