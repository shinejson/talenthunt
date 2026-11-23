(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminUsersController', ['ApiService', 'ToastService', 'AdminFilterUtils', 'DataTableSource',
      function (ApiService, ToastService, AdminFilterUtils, DataTableSource) {
        var vm = this;
        vm.users = [];
        vm.availableRoles = [];
        vm.meta = {};
        vm.editingUser = null;
        vm.roleChecks = {};
        vm.currentTab = 'admin';
        vm.filters = {
          q: '',
          role: '',
          status: '',
          is_verified: '',
          group: 'admin'
        };

        vm.switchTab = function (tab) {
          vm.currentTab = tab;
          vm.filters.group = tab;
          vm.filters.role = '';
          vm.load(1);
        };

        vm.filteredRoles = function () {
          var adminRoles = ['SUPER_ADMIN', 'COMPETITION_MANAGER', 'FINANCE_OFFICER', 'MODERATOR', 'REVIEWER'];
          if (vm.currentTab === 'admin') {
            return adminRoles;
          } else {
            return ['APPLICANT', 'NOMINEE', 'VISITOR'];
          }
        };

        vm.activeFilterCount = function () {
          var copy = angular.copy(vm.filters);
          delete copy.group;
          return AdminFilterUtils.countActive(copy);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', role: '', status: '', is_verified: '', group: vm.currentTab };
          vm.load(1);
        };

        vm.table = DataTableSource.server('/admin/users',
          function () { return AdminFilterUtils.cleanParams(vm.filters); },
          function (res) {
            vm.users = res.data || [];
            vm.meta = res.meta || {};
            if (res.meta && res.meta.available_roles && res.meta.available_roles.length) {
              vm.availableRoles = res.meta.available_roles;
            }
          });

        vm.load = function (page) { vm.table.load(page); };

        vm.openRoleEditor = function (u) {
          vm.editingUser = u;
          vm.roleChecks = {};
          for (var i = 0; i < u.roles.length; i++) {
            vm.roleChecks[u.roles[i]] = true;
          }
        };

        vm.saveRoles = function () {
          var selected = [];
          angular.forEach(vm.roleChecks, function (val, key) {
            if (val) selected.push(key);
          });
          ApiService.patch('/admin/users/' + vm.editingUser.id + '/roles', { roles: selected }).then(function () {
            ToastService.success('Roles updated for ' + vm.editingUser.full_name);
            vm.editingUser = null;
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        vm.toggleStatus = function (u) {
          var next = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
          ApiService.patch('/admin/users/' + u.id + '/status', { status: next }).then(function () {
            ToastService.success('Account status changed to ' + next);
            vm.load(vm.meta.page);
          }, function (err) { ToastService.error(err.message); });
        };

        // --- PASSWORD RESET FEATURE ---
        vm.resetTargetUser = null;
        vm.resetPasswordForm = { password: '', confirm: '', showPassword: false };
        vm.resettingPassword = false;

        vm.openPasswordReset = function (u) {
          vm.resetTargetUser = u;
          vm.resetPasswordForm = { password: '', confirm: '', showPassword: false };
        };

        vm.closePasswordReset = function () {
          vm.resetTargetUser = null;
          vm.resetPasswordForm = { password: '', confirm: '', showPassword: false };
          vm.resettingPassword = false;
        };

        vm.generatePassword = function () {
          var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
          var pwd = 'SL@';
          for (var i = 0; i < 8; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          pwd += (Math.floor(Math.random() * 89) + 10) + '!';
          vm.resetPasswordForm.password = pwd;
          vm.resetPasswordForm.confirm = pwd;
          vm.resetPasswordForm.showPassword = true;
          ToastService.success('Secure password generated.');
        };

        vm.copyPassword = function () {
          if (!vm.resetPasswordForm.password) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(vm.resetPasswordForm.password).then(function () {
              ToastService.success('Password copied to clipboard!');
            }, function () {
              ToastService.info('Password: ' + vm.resetPasswordForm.password);
            });
          } else {
            ToastService.info('Password: ' + vm.resetPasswordForm.password);
          }
        };

        vm.submitPasswordReset = function () {
          if (!vm.resetPasswordForm.password || vm.resetPasswordForm.password.length < 8) {
            ToastService.error('Password must be at least 8 characters long.');
            return;
          }
          if (vm.resetPasswordForm.password !== vm.resetPasswordForm.confirm) {
            ToastService.error('Passwords do not match.');
            return;
          }
          vm.resettingPassword = true;
          ApiService.post('/admin/users/' + vm.resetTargetUser.id + '/reset-password', {
            password: vm.resetPasswordForm.password
          }).then(function (res) {
            vm.resettingPassword = false;
            ToastService.success((res.data && res.data.message) || ('Password reset successfully for ' + vm.resetTargetUser.full_name));
            vm.closePasswordReset();
          }, function (err) {
            vm.resettingPassword = false;
            ToastService.error(err.message || 'Failed to reset password.');
          });
        };
      }
    ])
    .controller('AdminModerationController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils', 'DataTableSource',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils, DataTableSource) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.reports = [];
        vm.tickets = [];
        vm.modFilters = { q: '', entity_type: '', status: '' };
        vm.ticketFilters = { q: '', category: '', status: '' };

        vm.modMeta = {};
        vm.ticketMeta = {};

        vm.modTable = DataTableSource.server('/admin/moderation',
          function () { return AdminFilterUtils.cleanParams(vm.modFilters); },
          function (res) {
            vm.reports = res.data || [];
            vm.modMeta = res.meta || {};
          });

        vm.ticketTable = DataTableSource.server('/admin/support-tickets',
          function () { return AdminFilterUtils.cleanParams(vm.ticketFilters); },
          function (res) {
            vm.tickets = res.data || [];
            vm.ticketMeta = res.meta || {};
          });

        vm.loadModeration = function (page) { vm.modTable.load(page); };
        vm.loadTickets = function (page) { vm.ticketTable.load(page); };

        vm.activeModFilterCount = function () {
          return AdminFilterUtils.countActive(vm.modFilters);
        };

        vm.resetModFilters = function () {
          vm.modFilters = { q: '', entity_type: '', status: '' };
          vm.loadModeration(1);
        };

        vm.activeTicketFilterCount = function () {
          return AdminFilterUtils.countActive(vm.ticketFilters);
        };

        vm.resetTicketFilters = function () {
          vm.ticketFilters = { q: '', category: '', status: '' };
          vm.loadTickets(1);
        };

        vm.resolveReport = function (r, st) {
          var notes = window.prompt('Enter moderation resolution notes:', r.resolution_notes || 'Reviewed by moderation');
          if (notes === null) return;
          ApiService.patch('/admin/moderation/' + r.id, { status: st, resolution_notes: notes }).then(function () {
            ToastService.success('Moderation case updated.');
            vm.loadModeration();
          });
        };

        vm.resolveTicket = function (t, st) {
          var notes = window.prompt('Enter support resolution notes:', t.resolution_notes || 'Resolved with customer');
          if (notes === null) return;
          ApiService.patch('/admin/support-tickets/' + t.id, { status: st, resolution_notes: notes }).then(function () {
            ToastService.success('Support ticket updated.');
            vm.loadTickets();
          });
        };
      }
    ])
    .controller('AdminSettingsController', ['ApiService', 'ToastService', 'AdminFilterUtils', 'AdService', '$timeout', '$scope', '$rootScope',
      function (ApiService, ToastService, AdminFilterUtils, AdService, $timeout, $scope, $rootScope) {
        var vm = this;

        // --- TAB STATE ---
        vm.activeTab = 'basic_info';
        vm.tabs = [
          { id: 'basic_info', label: 'Basic Info', icon: 'settings' },
          { id: 'integrations', label: 'Integrations', icon: 'plug' },
          { id: 'pricing', label: 'Application Fee & Pricing', icon: 'tag' },
          { id: 'social_links', label: 'Social Media', icon: 'share-2' },
          { id: 'backup', label: 'Backup', icon: 'download' },
          { id: 'logs', label: 'Logs', icon: 'history' },
          { id: 'announcements', label: 'Announcements', icon: 'bell' },
          { id: 'ads', label: 'Ads', icon: 'radio' }
        ];

        vm.integrationSubTab = 'payments'; // 'payments' | 'sms' | 'email' | 'webhooks'
        vm.setIntegrationSubTab = function (sub) {
          vm.integrationSubTab = sub;
        };

        vm.switchTab = function (tabId) {
          if (tabId === 'payment_gateway') {
            vm.activeTab = 'integrations';
            vm.integrationSubTab = 'payments';
            return;
          }
          if (tabId === 'sms_config') {
            vm.activeTab = 'integrations';
            vm.integrationSubTab = 'sms';
            return;
          }
          if (tabId === 'email_config') {
            vm.activeTab = 'integrations';
            vm.integrationSubTab = 'email';
            return;
          }
          if (tabId === 'webhooks') {
            vm.activeTab = 'integrations';
            vm.integrationSubTab = 'webhooks';
            return;
          }
          vm.activeTab = tabId;
          if (tabId === 'logs' && (!vm.logs.items || !vm.logs.items.length)) {
            vm.loadLogs();
          }
        };

        // --- BASIC INFO ---
        vm.basicInfo = {
          platform_name: 'StageLight',
          logo_url: null,
          favicon_url: null,
          currency: 'GHS',
          timezone: 'Africa/Accra',
          contact_email: 'support@stagelight.com.gh',
          contact_phone: '+233 24 000 0000'
        };
        vm.logoAsset = null;
        vm.faviconAsset = null;
        vm.savingBasic = false;

        // --- SOCIAL MEDIA LINKS ---
        vm.socialLinks = {
          facebook_url: 'https://facebook.com/stagelightgh',
          instagram_url: 'https://instagram.com/stagelightgh',
          twitter_url: 'https://x.com/stagelightgh',
          youtube_url: 'https://youtube.com/@stagelightgh',
          tiktok_url: 'https://tiktok.com/@stagelightgh',
          whatsapp_number: '+233240000000',
          linkedin_url: ''
        };
        vm.savingSocial = false;

        // --- PAYMENT GATEWAY CONFIG ---
        vm.paymentConfig = {
          active_provider: 'mock',
          environment: 'sandbox',
          currency: 'GHS',
          allow_mobile_money: true,
          allow_card: true,
          min_amount_ghs: 1.0,
          max_daily_spend_ghs: 5000.0,
          platform_fee_percent: 0.0,
          auto_settle_mock: true,
          paystack: {
            enabled: true,
            public_key: '',
            secret_key: '',
            webhook_secret: '',
            base_url: 'https://api.paystack.co'
          },
          hubtel: {
            enabled: false,
            client_id: '',
            client_secret: '',
            merchant_account_number: ''
          },
          flutterwave: {
            enabled: false,
            public_key: '',
            secret_key: '',
            encryption_key: '',
            webhook_secret: ''
          }
        };
        vm.savingPayment = false;
        vm.testingPaymentGateway = false;
        vm.testGatewayResult = null;
        vm.showSecrets = {
          paystack_public: false,
          paystack_secret: false,
          paystack_webhook: false,
          hubtel_id: false,
          hubtel_secret: false,
          flutterwave_public: false,
          flutterwave_secret: false,
          flutterwave_hash: false,
          sms_key: false,
          email_password: false
        };
        vm.toggleSecret = function (field) {
          vm.showSecrets[field] = !vm.showSecrets[field];
        };

        // --- APPLICATION PRICING & COMPETITION FEES ---
        vm.applicationPricing = {
          default_fee_major: 50.0,
          default_fee_minor: 5000,
          require_application_fee: true,
          currency: 'GHS',
          allow_offline_vouchers: true
        };
        vm.competitionsPricing = [];
        vm.savingPricing = false;

        // --- SMS CONFIG ---
        vm.smsConfig = {
          provider: 'arkesel',
          api_key: '',
          sender_id: 'StageLight',
          test_phone: ''
        };
        vm.savingSms = false;
        vm.sendingSmsTest = false;

        // --- EMAIL CONFIG ---
        vm.emailConfig = {
          server: 'smtp.sendgrid.net',
          port: 587,
          use_tls: true,
          username: 'apikey',
          password: '',
          default_sender: 'StageLight Ghana <noreply@stagelight.com.gh>'
        };
        vm.savingEmail = false;
        vm.sendingEmailTest = false;

        // --- INTEGRATION SUITE DIAGNOSTICS & HELPERS ---
        vm.smsTestResult = null;
        vm.emailTestResult = null;
        vm.savingIntegrations = false;

        vm.saveAllIntegrations = function () {
          vm.savingIntegrations = true;
          ApiService.patch('/admin/settings', {
            payment_gateway: vm.paymentConfig,
            sms_config: vm.smsConfig,
            email_config: vm.emailConfig
          }).then(function () {
            vm.savingIntegrations = false;
            ToastService.success('All integration settings saved successfully!');
          }, function (err) {
            vm.savingIntegrations = false;
            ToastService.error(err.message || 'Failed to save integration settings.');
          });
        };

        vm.applyEmailPreset = function (preset) {
          if (preset === 'sendgrid') {
            vm.emailConfig.server = 'smtp.sendgrid.net';
            vm.emailConfig.port = 587;
            vm.emailConfig.use_tls = true;
            vm.emailConfig.username = 'apikey';
            ToastService.info('SendGrid presets loaded. Paste your API key as password.');
          } else if (preset === 'mailgun') {
            vm.emailConfig.server = 'smtp.mailgun.org';
            vm.emailConfig.port = 587;
            vm.emailConfig.use_tls = true;
            ToastService.info('Mailgun presets loaded.');
          } else if (preset === 'gmail') {
            vm.emailConfig.server = 'smtp.gmail.com';
            vm.emailConfig.port = 587;
            vm.emailConfig.use_tls = true;
            ToastService.info('Google Workspace presets loaded. Use an App Password if 2FA is active.');
          }
        };

        // --- BACKUP ---
        vm.backupConfig = {
          last_backup: null,
          auto_backup_enabled: false,
          schedule: 'weekly',
          storage_path: '/app/backend/uploads/backups'
        };
        vm.savingBackup = false;
        vm.triggeringBackup = false;

        // --- LOGS ---
        vm.logs = {
          loading: false,
          items: [],
          filters: { q: '', entity_type: '', action: '' },
          meta: {}
        };

        // --- ANNOUNCEMENTS ---
        vm.announcements = [];
        var today = new Date().toISOString().slice(0, 10);
        vm.newAnn = { title: '', date: today, summary: '' };
        vm.annFilters = { q: '', sort: 'newest' };
        vm.editingAnn = null;

        // --- ADS ---
        vm.adSettings = {
          ads_enabled: true,
          google_ads_enabled: true,
          google_ads_client_id: 'ca-pub-6412959828302194',
          google_ads_slots: {
            home_leaderboard: '4892019283',
            home_mid: '7193028491',
            nominees_top: '1003003003',
            nominee_profile: '1004004004',
            voting_page: '1005005005',
            results_page: '1006006006',
            sidebar: '9382019482'
          },
          partner_ads_enabled: true,
          partner_ads_rotation_seconds: 6,
          ad_banner_style: 'hybrid',
          ad_disclosure_text: 'Sponsored Advertisement'
        };
        vm.savingAds = false;

        // --- LOAD ALL SETTINGS ---
        function loadSettings() {
          ApiService.get('/admin/settings').then(function (res) {
            var data = res.data || {};
            if (data.basic_info) angular.extend(vm.basicInfo, data.basic_info);
            if (data.social_links) angular.extend(vm.socialLinks, data.social_links);
            if (data.payment_gateway) {
              angular.extend(vm.paymentConfig, data.payment_gateway);
              if (data.payment_gateway.paystack) {
                vm.paymentConfig.paystack = angular.extend({}, vm.paymentConfig.paystack, data.payment_gateway.paystack);
              }
              if (data.payment_gateway.hubtel) {
                vm.paymentConfig.hubtel = angular.extend({}, vm.paymentConfig.hubtel, data.payment_gateway.hubtel);
              }
              if (data.payment_gateway.flutterwave) {
                vm.paymentConfig.flutterwave = angular.extend({}, vm.paymentConfig.flutterwave, data.payment_gateway.flutterwave);
              }
            }
            if (data.application_pricing) {
              angular.extend(vm.applicationPricing, data.application_pricing);
            }
            if (data.competitions_pricing) {
              vm.competitionsPricing = data.competitions_pricing;
            }
            if (data.sms_config) angular.extend(vm.smsConfig, data.sms_config);
            if (data.email_config) angular.extend(vm.emailConfig, data.email_config);
            if (data.backup_config) angular.extend(vm.backupConfig, data.backup_config);
            if (data.announcements && data.announcements.items) {
              vm.announcements = data.announcements.items;
            }
            if (data.ad_settings) {
              angular.extend(vm.adSettings, data.ad_settings);
              if (data.ad_settings.google_ads_slots) {
                vm.adSettings.google_ads_slots = angular.extend({}, vm.adSettings.google_ads_slots, data.ad_settings.google_ads_slots);
              }
            }
          });
        }
        loadSettings();

        // --- APPLICATION PRICING ACTIONS ---
        vm.saveApplicationPricing = function () {
          vm.savingPricing = true;
          ApiService.patch('/admin/settings', {
            application_pricing: vm.applicationPricing,
            competition_fees: vm.competitionsPricing
          }).then(function () {
            vm.savingPricing = false;
            ToastService.success('Application pricing and competition fees saved successfully.');
          }, function (err) {
            vm.savingPricing = false;
            ToastService.error(err.message || 'Failed to update pricing settings.');
          });
        };

        vm.updateCompetitionFee = function (comp) {
          comp._saving = true;
          ApiService.patch('/admin/competitions/' + comp.id, {
            application_fee_major: comp.application_fee_major
          }).then(function (res) {
            comp._saving = false;
            ToastService.success('Fee updated for ' + comp.title);
          }, function (err) {
            comp._saving = false;
            ToastService.error(err.message || 'Failed to update competition fee.');
          });
        };

        // --- PAYMENT GATEWAY ACTIONS ---
        vm.savePaymentConfig = function () {
          vm.savingPayment = true;
          vm.testGatewayResult = null;
          ApiService.patch('/admin/settings', { payment_gateway: vm.paymentConfig }).then(function () {
            vm.savingPayment = false;
            ToastService.success('Payment gateway configuration saved successfully.');
          }, function (err) {
            vm.savingPayment = false;
            ToastService.error(err.message || 'Failed to save payment gateway settings.');
          });
        };

        vm.testPaymentGateway = function (targetProvider) {
          var prov = targetProvider || vm.paymentConfig.active_provider;
          vm.testingPaymentGateway = true;
          vm.testGatewayResult = null;
          ApiService.post('/admin/settings/payment-gateway-test', {
            provider: prov,
            config: vm.paymentConfig
          }).then(function (res) {
            vm.testingPaymentGateway = false;
            vm.testGatewayResult = res.data;
            if (res.data && res.data.success) {
              ToastService.success(res.data.message || 'Payment gateway connection verified successfully!');
            } else {
              ToastService.warning(res.data ? res.data.message : 'Gateway verification returned an alert.');
            }
          }, function (err) {
            vm.testingPaymentGateway = false;
            vm.testGatewayResult = {
              success: false,
              message: err.message || 'Payment gateway connectivity test failed.'
            };
            ToastService.error(err.message || 'Payment gateway test failed.');
          });
        };

        vm.getWebhookUrl = function (provider) {
          var origin = window.location.origin || '';
          return origin + '/api/v1/payments/webhooks/' + (provider || 'paystack');
        };

        vm.copyToClipboard = function (text, label) {
          if (!text) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              ToastService.success((label || 'URL') + ' copied to clipboard.');
            }, function () {
              ToastService.info('Please copy manually: ' + text);
            });
          } else {
            ToastService.info('Please copy manually: ' + text);
          }
        };

        // --- BASIC INFO ACTIONS ---
        vm.saveBasicInfo = function () {
          vm.savingBasic = true;
          ApiService.patch('/admin/settings', { basic_info: vm.basicInfo }).then(function () {
            vm.savingBasic = false;
            ToastService.success('Platform branding and basic info saved.');
          }, function (err) {
            vm.savingBasic = false;
            ToastService.error(err.message || 'Failed to save basic info.');
          });
        };

        // --- SOCIAL MEDIA ACTIONS ---
        vm.getWhatsAppUrl = function (val) {
          if (!val) return '';
          if (val.indexOf('http://') === 0 || val.indexOf('https://') === 0) return val;
          var digits = val.replace(/\D/g, '');
          return 'https://wa.me/' + digits;
        };

        vm.saveSocialLinks = function () {
          vm.savingSocial = true;
          ApiService.patch('/admin/settings', { social_links: vm.socialLinks }).then(function () {
            vm.savingSocial = false;
            ToastService.success('Social media links saved successfully.');
            $rootScope.$broadcast('platformInfoChanged');
          }, function (err) {
            vm.savingSocial = false;
            ToastService.error(err.message || 'Failed to save social media links.');
          });
        };

        vm.triggerLogoPicker = function () {
          var input = document.getElementById('slLogoFileInput');
          if (input) input.click();
        };

        vm.triggerFaviconPicker = function () {
          var input = document.getElementById('slFaviconFileInput');
          if (input) input.click();
        };

        vm.onLogoFileChange = function (files) {
          if (!files || !files[0]) return;
          var file = files[0];
          ApiService.upload('/admin/settings/logo', file).then(function (res) {
            vm.basicInfo.logo_url = res.data.url;
            ToastService.success('Platform logo updated.');
          }, function (err) {
            ToastService.error(err.message || 'Logo upload failed.');
          });
        };

        vm.onFaviconFileChange = function (files) {
          if (!files || !files[0]) return;
          var file = files[0];
          ApiService.upload('/admin/settings/favicon', file).then(function (res) {
            vm.basicInfo.favicon_url = res.data.url;
            ToastService.success('Platform favicon updated.');
            var link = document.querySelector("link[rel='icon']");
            if (link) link.href = res.data.url;
          }, function (err) {
            ToastService.error(err.message || 'Favicon upload failed.');
          });
        };

        vm.uploadLogo = function (assetOrFile) {
          if (!assetOrFile) return;
          if (assetOrFile.public_url || assetOrFile.url) {
            vm.basicInfo.logo_url = assetOrFile.public_url || assetOrFile.url;
            vm.saveBasicInfo();
          } else {
            ApiService.upload('/admin/settings/logo', assetOrFile).then(function (res) {
              vm.basicInfo.logo_url = res.data.url;
              ToastService.success('Logo uploaded.');
            }, function (err) { ToastService.error(err.message || 'Upload failed.'); });
          }
        };

        vm.uploadFavicon = function (assetOrFile) {
          if (!assetOrFile) return;
          if (assetOrFile.public_url || assetOrFile.url) {
            vm.basicInfo.favicon_url = assetOrFile.public_url || assetOrFile.url;
            vm.saveBasicInfo();
          } else {
            ApiService.upload('/admin/settings/favicon', assetOrFile).then(function (res) {
              vm.basicInfo.favicon_url = res.data.url;
              ToastService.success('Favicon uploaded.');
            }, function (err) { ToastService.error(err.message || 'Upload failed.'); });
          }
        };

        // --- SMS CONFIG ACTIONS ---
        vm.saveSmsConfig = function () {
          vm.savingSms = true;
          ApiService.patch('/admin/settings', { sms_config: vm.smsConfig }).then(function () {
            vm.savingSms = false;
            ToastService.success('SMS Gateway configuration saved.');
          }, function (err) {
            vm.savingSms = false;
            ToastService.error(err.message || 'Failed to save SMS config.');
          });
        };

        vm.sendSmsTest = function () {
          if (!vm.smsConfig.test_phone) {
            ToastService.error('Please enter a test phone number first.');
            return;
          }
          vm.sendingSmsTest = true;
          vm.smsTestResult = null;
          ApiService.post('/admin/settings/sms-test', vm.smsConfig).then(function (res) {
            vm.sendingSmsTest = false;
            vm.smsTestResult = res.data;
            ToastService.success(res.data.message || ('Test SMS dispatched to ' + vm.smsConfig.test_phone));
          }, function (err) {
            vm.sendingSmsTest = false;
            vm.smsTestResult = {
              sent: false,
              message: err.message || 'Failed to send test SMS.'
            };
            ToastService.error(err.message || 'Failed to send test SMS.');
          });
        };

        // --- EMAIL CONFIG ACTIONS ---
        vm.saveEmailConfig = function () {
          vm.savingEmail = true;
          ApiService.patch('/admin/settings', { email_config: vm.emailConfig }).then(function () {
            vm.savingEmail = false;
            ToastService.success('Transactional Email configuration saved.');
          }, function (err) {
            vm.savingEmail = false;
            ToastService.error(err.message || 'Failed to save Email config.');
          });
        };

        vm.sendEmailTest = function () {
          vm.sendingEmailTest = true;
          vm.emailTestResult = null;
          ApiService.post('/admin/settings/email-test', vm.emailConfig).then(function (res) {
            vm.sendingEmailTest = false;
            vm.emailTestResult = res.data;
            ToastService.success(res.data.message || 'Test email dispatched.');
          }, function (err) {
            vm.sendingEmailTest = false;
            vm.emailTestResult = {
              sent: false,
              message: err.message || 'Failed to send test email.'
            };
            ToastService.error(err.message || 'Failed to send test email.');
          });
        };

        // --- BACKUP ACTIONS ---
        vm.saveBackupConfig = function () {
          vm.savingBackup = true;
          ApiService.patch('/admin/settings', { backup_config: vm.backupConfig }).then(function () {
            vm.savingBackup = false;
            ToastService.success('Backup schedule configuration saved.');
          }, function (err) {
            vm.savingBackup = false;
            ToastService.error(err.message || 'Failed to save backup config.');
          });
        };

        vm.triggerBackup = function () {
          vm.triggeringBackup = true;
          ApiService.post('/admin/settings/backup-now', {}).then(function (res) {
            vm.triggeringBackup = false;
            vm.backupConfig.last_backup = res.data.timestamp;
            ToastService.success(res.data.message || 'System backup created successfully.');
          }, function (err) {
            vm.triggeringBackup = false;
            ToastService.error(err.message || 'Failed to trigger backup.');
          });
        };

        // --- LOGS ACTIONS ---
        vm.loadLogs = function () {
          vm.logs.loading = true;
          ApiService.get('/admin/audit-logs', AdminFilterUtils.cleanParams(vm.logs.filters)).then(function (res) {
            vm.logs.items = res.data || [];
            vm.logs.meta = res.meta || {};
            vm.logs.loading = false;
          }, function (err) {
            vm.logs.loading = false;
            ToastService.error(err.message || 'Failed to load audit logs.');
          });
        };

        vm.resetLogFilters = function () {
          vm.logs.filters = { q: '', entity_type: '', action: '' };
          vm.loadLogs();
        };

        // --- ANNOUNCEMENTS ACTIONS ---
        vm.filteredAnnouncements = function () {
          var q = (vm.annFilters.q || '').trim().toLowerCase();
          var list = (vm.announcements || []).filter(function (a) {
            if (!q) return true;
            var hay = ((a.title || '') + ' ' + (a.summary || '') + ' ' + (a.date || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
          });
          if (vm.annFilters.sort === 'oldest') {
            list = list.slice().reverse();
          }
          return list;
        };

        vm.addAnnouncement = function () {
          if (!vm.newAnn.title || !vm.newAnn.summary) {
            ToastService.error('Please enter announcement title and summary.');
            return;
          }
          var d = vm.newAnn.date;
          if (d instanceof Date) {
            d = d.toISOString().slice(0, 10);
          }
          var item = {
            id: 'ann-' + Date.now(),
            title: vm.newAnn.title.trim(),
            date: d || today,
            summary: vm.newAnn.summary.trim()
          };
          vm.announcements.unshift(item);
          ApiService.patch('/admin/settings', { announcements: { items: vm.announcements } }).then(function () {
            vm.newAnn = { title: '', date: today, summary: '' };
            ToastService.success('Announcement published.');
          }, function (err) {
            ToastService.error(err.message || 'Failed to publish announcement.');
          });
        };

        vm.startEditAnnouncement = function (a) {
          vm.editingAnn = angular.copy(a);
        };

        vm.cancelEditAnnouncement = function () {
          vm.editingAnn = null;
        };

        vm.saveEditAnnouncement = function () {
          if (!vm.editingAnn || !vm.editingAnn.title || !vm.editingAnn.summary) {
            ToastService.error('Title and summary cannot be blank.');
            return;
          }
          for (var i = 0; i < vm.announcements.length; i++) {
            if (vm.announcements[i].id === vm.editingAnn.id) {
              vm.announcements[i] = angular.copy(vm.editingAnn);
              break;
            }
          }
          ApiService.patch('/admin/settings', { announcements: { items: vm.announcements } }).then(function () {
            vm.editingAnn = null;
            ToastService.success('Announcement updated.');
          }, function (err) {
            ToastService.error(err.message || 'Failed to update announcement.');
          });
        };

        vm.deleteAnnouncement = function (a) {
          if (!window.confirm('Delete announcement "' + a.title + '"?')) return;
          vm.announcements = vm.announcements.filter(function (item) {
            return item.id !== a.id;
          });
          ApiService.patch('/admin/settings', { announcements: { items: vm.announcements } }).then(function () {
            ToastService.success('Announcement deleted.');
          }, function (err) {
            ToastService.error(err.message || 'Failed to delete announcement.');
          });
        };

        vm.activeAnnFilterCount = function () {
          var c = AdminFilterUtils.countActive(vm.annFilters, ['sort']);
          if (vm.annFilters.sort && vm.annFilters.sort !== 'newest') c++;
          return c;
        };

        vm.resetAnnFilters = function () {
          vm.annFilters = { q: '', sort: 'newest' };
        };

        // --- ADS ACTIONS ---
        vm.saveAdSettings = function () {
          vm.savingAds = true;
          ApiService.patch('/admin/settings', { ad_settings: vm.adSettings }).then(function () {
            vm.savingAds = false;
            ToastService.success('Advertising and sponsorship banner settings saved.');
            if (AdService && AdService.loadAds) {
              AdService.loadAds(true);
            }
          }, function (err) {
            vm.savingAds = false;
            ToastService.error(err.message || 'Failed to save ad settings.');
          });
        };
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      // --- USERS & RBAC VIEW ---
      $templateCache.put('admin/users.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <!-- Role Editor Card -->',
        '    <div class="card mb-3" ng-if="vm.editingUser">',
        '      <div class="flex-between mb-2">',
        '        <h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:8px;"><th-icon name="shield" size="16"></th-icon><span>Manage RBAC Roles: {{ vm.editingUser.full_name }}</span></h3>',
        '        <button type="button" class="btn-close" ng-click="vm.editingUser = null" aria-label="Close">&times;</button>',
        '      </div>',
        '      <div class="inline-actions mb-2" style="flex-wrap:wrap;gap:12px;">',
        '        <label ng-repeat="role in vm.availableRoles" style="margin-right:12px;font-size:0.85rem;"><input type="checkbox" ng-model="vm.roleChecks[role]" /> {{ role }}</label>',
        '      </div>',
        '      <div class="inline-actions"><button type="button" class="btn btn-sm btn-primary" ng-click="vm.saveRoles()">Save Roles</button><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.editingUser = null">Cancel</button></div>',
        '    </div>',
        '',
        '    <!-- Password Reset Modal -->',
        '    <div class="modal-backdrop" ng-if="vm.resetTargetUser" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">',
        '      <div class="card" style="max-width:460px;width:100%;margin:0;position:relative;box-shadow:0 20px 40px rgba(0,0,0,0.4);border:1px solid var(--border-strong);background:var(--bg-surface);">',
        '        <div class="flex-between mb-2">',
        '          <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '            <th-icon name="key" size="18" style="color:var(--accent);"></th-icon>',
        '            <span>Reset User Password</span>',
        '          </h3>',
        '          <button type="button" class="btn-close" ng-click="vm.closePasswordReset()" aria-label="Close">&times;</button>',
        '        </div>',
        '        <p class="muted" style="font-size:0.85rem;margin-bottom:16px;">',
        '          Set a new password for <strong>{{ vm.resetTargetUser.full_name }}</strong> (<code>{{ vm.resetTargetUser.email || vm.resetTargetUser.phone }}</code>). This action takes effect immediately and invalidates active sessions.',
        '        </p>',
        '',
        '        <form ng-submit="vm.submitPasswordReset()">',
        '          <div class="form-group mb-2">',
        '            <div class="flex-between mb-1">',
        '              <label class="filter-label" style="margin:0;">New Password</label>',
        '              <button type="button" class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:0.75rem;" ng-click="vm.generatePassword()">',
        '                <th-icon name="refresh" size="11"></th-icon><span>Generate Strong</span>',
        '              </button>',
        '            </div>',
        '            <div style="position:relative;display:flex;align-items:center;">',
        '              <input type="{{ vm.resetPasswordForm.showPassword ? \'text\' : \'password\' }}" class="form-control form-control-sm" ng-model="vm.resetPasswordForm.password" required minlength="8" placeholder="Minimum 8 characters" style="padding-right:72px;font-family:monospace;" />',
        '              <div style="position:absolute;right:6px;display:flex;gap:4px;">',
        '                <button type="button" class="btn-action-icon" style="width:26px;height:26px;min-width:26px;" ng-click="vm.resetPasswordForm.showPassword = !vm.resetPasswordForm.showPassword" title="{{ vm.resetPasswordForm.showPassword ? \'Hide password\' : \'Show password\' }}">',
        '                  <th-icon name="{{ vm.resetPasswordForm.showPassword ? \'eye-off\' : \'eye\' }}" size="13"></th-icon>',
        '                </button>',
        '                <button type="button" class="btn-action-icon" style="width:26px;height:26px;min-width:26px;" ng-click="vm.copyPassword()" title="Copy password" ng-if="vm.resetPasswordForm.password">',
        '                  <th-icon name="copy" size="13"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '          </div>',
        '',
        '          <div class="form-group mb-3">',
        '            <label class="filter-label">Confirm Password</label>',
        '            <input type="{{ vm.resetPasswordForm.showPassword ? \'text\' : \'password\' }}" class="form-control form-control-sm" ng-model="vm.resetPasswordForm.confirm" required minlength="8" placeholder="Re-enter password" style="font-family:monospace;" />',
        '          </div>',
        '',
        '          <div class="alert alert-warning mb-3" style="font-size:0.8rem;padding:8px 12px;" ng-if="vm.resetPasswordForm.password && vm.resetPasswordForm.confirm && vm.resetPasswordForm.password !== vm.resetPasswordForm.confirm">',
        '            <th-icon name="alert-triangle" size="14"></th-icon> Passwords do not match.',
        '          </div>',
        '',
        '          <div class="inline-actions" style="justify-content:flex-end;gap:8px;">',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.closePasswordReset()">Cancel</button>',
        '            <button type="submit" class="btn btn-sm btn-primary" ng-disabled="vm.resettingPassword || !vm.resetPasswordForm.password || vm.resetPasswordForm.password.length < 8 || vm.resetPasswordForm.password !== vm.resetPasswordForm.confirm">',
        '              <th-icon name="key" size="14"></th-icon>',
        '              <span>{{ vm.resettingPassword ? "Updating..." : "Update Password" }}</span>',
        '            </button>',
        '          </div>',
        '        </form>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Main Card -->',
        '    <div class="card">',
        '      <div class="flex-between mb-3">',
        '        <div>',
        '          <h1 style="margin:0;font-size:1.5rem;">Users &amp; Access Control</h1>',
        '          <p class="muted" style="margin:4px 0 0;font-size:0.85rem;">Manage platform administrators, staff roles, and contestant/applicant accounts.</p>',
        '        </div>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '',
        '      <!-- Sub-Tabs: Separate Admin Users from Applicants -->',
        '      <div class="admin-tab-nav mb-3">',
        '        <button type="button" class="admin-tab-btn" ng-class="{active: vm.currentTab === \'admin\'}" ng-click="vm.switchTab(\'admin\')">',
        '          <th-icon name="shield" size="16"></th-icon>',
        '          <span>Admin &amp; Staff Users</span>',
        '          <span class="admin-tab-badge" ng-if="vm.meta.admin_count !== undefined">{{ vm.meta.admin_count }}</span>',
        '        </button>',
        '        <button type="button" class="admin-tab-btn" ng-class="{active: vm.currentTab === \'applicants\'}" ng-click="vm.switchTab(\'applicants\')">',
        '          <th-icon name="users" size="16"></th-icon>',
        '          <span>Applicants &amp; Contestants</span>',
        '          <span class="admin-tab-badge" ng-if="vm.meta.applicant_count !== undefined">{{ vm.meta.applicant_count }}</span>',
        '        </button>',
        '      </div>',
        '',
        '      <!-- Filter Bar -->',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter {{ vm.currentTab === "admin" ? "Admin Staff" : "Applicants" }}</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.users.length }} user(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search {{ vm.currentTab === "admin" ? "Admins" : "Applicants" }}</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Name, email, phone, location..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Role Filter</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.role" ng-change="vm.load(1)">',
        '              <option value="">All Roles</option>',
        '              <option ng-repeat="r in vm.filteredRoles()" value="{{ r }}">{{ r }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Account Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '              <option value="">All Statuses</option>',
        '              <option value="ACTIVE">ACTIVE</option>',
        '              <option value="SUSPENDED">SUSPENDED</option>',
        '              <option value="DEACTIVATED">DEACTIVATED</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Contact Verification</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.is_verified" ng-change="vm.load(1)">',
        '              <option value="">All</option>',
        '              <option value="true">Verified</option>',
        '              <option value="false">Unverified</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Admin Users Table: Actions are Icons Only -->',
        '      <div class="table-responsive" ng-if="vm.currentTab === \'admin\'">',
        '        <table class="data-table" th-datatable="vm.table" dt-row="u" dt-empty="No admin or staff accounts match the selected filters.">',
        '          <thead><tr><th dt-sort="full_name">Staff Member</th><th dt-sort="email">Contact</th><th>Assigned Roles</th><th dt-sort="status">Status</th><th style="width:130px;text-align:center;">Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td><strong>{{ u.full_name }}</strong><div class="muted" style="font-size:0.76rem;" ng-if="u.location">{{ u.location }}</div></td>',
        '              <td>{{ u.email || u.phone }}</td>',
        '              <td><code>{{ u.roles.join(", ") }}</code></td>',
        '              <td><th-status-badge status="u.status"></th-status-badge></td>',
        '              <td style="text-align:center;">',
        '                <div class="inline-actions" style="gap:6px;justify-content:center;">',
        '                  <button type="button" class="btn-action-icon" ng-click="vm.openRoleEditor(u)" title="Edit RBAC Roles ({{ u.full_name }})" aria-label="Edit RBAC Roles">',
        '                    <th-icon name="shield" size="15"></th-icon>',
        '                  </button>',
        '                  <button type="button" class="btn-action-icon btn-primary-icon" ng-click="vm.openPasswordReset(u)" title="Reset Password ({{ u.full_name }})" aria-label="Reset Password">',
        '                    <th-icon name="key" size="15"></th-icon>',
        '                  </button>',
        '                  <button type="button" class="btn-action-icon" ng-class="{\'btn-danger-icon\': u.status === \'ACTIVE\', \'btn-success-icon\': u.status !== \'ACTIVE\'}" ng-click="vm.toggleStatus(u)" title="{{ u.status === \'ACTIVE\' ? \'Suspend Account\' : \'Activate Account\' }}" aria-label="{{ u.status === \'ACTIVE\' ? \'Suspend Account\' : \'Activate Account\' }}">',
        '                    <th-icon name="{{ u.status === \'ACTIVE\' ? \'user-x\' : \'user-check\' }}" size="15"></th-icon>',
        '                  </button>',
        '                </div>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '',
        '      <!-- Applicants Table -->',
        '      <div class="table-responsive" ng-if="vm.currentTab === \'applicants\'">',
        '        <table class="data-table" th-datatable="vm.table" dt-row="u" dt-empty="No applicant or contestant accounts match the selected filters.">',
        '          <thead><tr><th dt-sort="full_name">Contestant / Applicant</th><th dt-sort="email">Contact</th><th>Account Type</th><th>Verification</th><th dt-sort="status">Status</th><th style="width:130px;text-align:center;">Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td><strong>{{ u.full_name }}</strong><div class="muted" style="font-size:0.76rem;" ng-if="u.location">{{ u.location }}</div></td>',
        '              <td>{{ u.email || u.phone }}</td>',
        '              <td><code>{{ u.roles.join(", ") }}</code></td>',
        '              <td><span class="badge" ng-class="{\'badge-success\': u.is_verified, \'badge-warning\': !u.is_verified}">{{ u.is_verified ? "Verified" : "Unverified" }}</span></td>',
        '              <td><th-status-badge status="u.status"></th-status-badge></td>',
        '              <td style="text-align:center;">',
        '                <div class="inline-actions" style="gap:6px;justify-content:center;">',
        '                  <button type="button" class="btn-action-icon" ng-click="vm.openRoleEditor(u)" title="Edit Roles ({{ u.full_name }})" aria-label="Edit Roles">',
        '                    <th-icon name="shield" size="15"></th-icon>',
        '                  </button>',
        '                  <button type="button" class="btn-action-icon btn-primary-icon" ng-click="vm.openPasswordReset(u)" title="Reset Password ({{ u.full_name }})" aria-label="Reset Password">',
        '                    <th-icon name="key" size="15"></th-icon>',
        '                  </button>',
        '                  <button type="button" class="btn-action-icon" ng-class="{\'btn-danger-icon\': u.status === \'ACTIVE\', \'btn-success-icon\': u.status !== \'ACTIVE\'}" ng-click="vm.toggleStatus(u)" title="{{ u.status === \'ACTIVE\' ? \'Suspend Account\' : \'Activate Account\' }}" aria-label="{{ u.status === \'ACTIVE\' ? \'Suspend Account\' : \'Activate Account\' }}">',
        '                    <th-icon name="{{ u.status === \'ACTIVE\' ? \'user-x\' : \'user-check\' }}" size="15"></th-icon>',
        '                  </button>',
        '                </div>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      // --- MODERATION & FRAUD QUEUE VIEW ---
      $templateCache.put('admin/moderation.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3" ng-if="vm.perms.canModerate()">',
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Moderation &amp; Fraud Review Queue</h1>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadModeration()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Moderation Cases</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.modMeta.total !== undefined ? vm.modMeta.total : vm.reports.length }} case(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeModFilterCount() > 0" ng-click="vm.resetModFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Cases</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.modFilters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadModeration(1)" placeholder="Reason, details, entity ID..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Entity Type</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.modFilters.entity_type" ng-change="vm.loadModeration(1)">',
        '              <option value="">All Types</option>',
        '              <option value="SUBMISSION">SUBMISSION</option>',
        '              <option value="NOMINEE">NOMINEE</option>',
        '              <option value="VOTING_ANOMALY">VOTING_ANOMALY</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.modFilters.status" ng-change="vm.loadModeration(1)">',
        '              <option value="">All Statuses</option>',
        '              <option value="OPEN">OPEN</option>',
        '              <option value="INVESTIGATING">INVESTIGATING</option>',
        '              <option value="ACTIONED">ACTIONED</option>',
        '              <option value="DISMISSED">DISMISSED</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable="vm.modTable" dt-row="r" dt-page-length="10" dt-empty="No moderation or anomaly cases match the selected filters.">',
        '          <thead><tr><th dt-sort="entity_type">Type</th><th dt-sort="reason">Reason</th><th>Details</th><th dt-sort="status">Status</th><th>Action</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td>{{ r.entity_type }}</td><td><strong>{{ r.reason }}</strong></td><td>{{ r.details }}</td>',
        '              <td><th-status-badge status="r.status"></th-status-badge></td>',
        '              <td class="inline-actions"><button type="button" class="btn btn-sm btn-primary" ng-click="vm.resolveReport(r, \'ACTIONED\')">Action</button><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.resolveReport(r, \'DISMISSED\')">Dismiss</button></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '',
        '    <div class="card">',
        '      <div class="flex-between mb-2">',
        '        <h2 style="margin:0;font-size:1.3rem;">Support Tickets</h2>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadTickets()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Support Tickets</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.ticketMeta.total !== undefined ? vm.ticketMeta.total : vm.tickets.length }} ticket(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeTicketFilterCount() > 0" ng-click="vm.resetTicketFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Tickets</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.ticketFilters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadTickets(1)" placeholder="Ticket ref, subject, contact, order ref..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Category</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.ticketFilters.category" ng-change="vm.loadTickets(1)">',
        '              <option value="">All Categories</option>',
        '              <option value="PAYMENT">PAYMENT</option>',
        '              <option value="VOTING">VOTING</option>',
        '              <option value="APPLICATION">APPLICATION</option>',
        '              <option value="GENERAL">GENERAL</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.ticketFilters.status" ng-change="vm.loadTickets(1)">',
        '              <option value="">All Statuses</option>',
        '              <option value="OPEN">OPEN</option>',
        '              <option value="IN_PROGRESS">IN_PROGRESS</option>',
        '              <option value="RESOLVED">RESOLVED</option>',
        '              <option value="CLOSED">CLOSED</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable="vm.ticketTable" dt-row="t" dt-page-length="10" dt-empty="No support tickets match the selected filters.">',
        '          <thead><tr><th dt-sort="ticket_reference">Ref</th><th dt-sort="category">Category</th><th dt-sort="contact_name">Contact</th><th dt-sort="subject">Subject</th><th dt-sort="status">Status</th><th></th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td><code>{{ t.ticket_reference }}</code></td><td>{{ t.category }}</td><td>{{ t.contact_name }} ({{ t.contact_phone || t.contact_email }})</td><td>{{ t.subject }}</td>',
        '              <td><th-status-badge status="t.status"></th-status-badge></td>',
        '              <td><button type="button" class="btn btn-sm btn-primary" ng-click="vm.resolveTicket(t, \'RESOLVED\')">Resolve</button></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      // --- PLATFORM SETTINGS VIEW (7 TABS) ---
      $templateCache.put('admin/settings.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="sp-admin-tabs">',
        '      <button ng-repeat="t in vm.tabs" class="sp-admin-tab" ng-class="{active: vm.activeTab === t.id}" ng-click="vm.switchTab(t.id)">',
        '        <th-icon name="{{ t.icon }}" size="14"></th-icon><span>{{ t.label }}</span>',
        '      </button>',
        '    </div>',
        '',
        '    <!-- TAB 1: BASIC INFO (Logo, Favicon, Branding) -->',
        '    <div ng-if="vm.activeTab === \'basic_info\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Basic Information &amp; Branding</h1>',
        '      <p class="muted mb-3" style="font-size:0.88rem;">Configure global platform naming, currency, contact channels, and visual brand assets.</p>',
        '',
        '      <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Platform Brand Name</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.platform_name" placeholder="StageLight Ghana" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Primary Currency</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.currency" placeholder="GHS" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Timezone</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.timezone" placeholder="Africa/Accra" />',
        '        </div>',
        '      </div>',
        '',
        '      <div class="grid-2 mb-3">',
        '        <div>',
        '          <label class="form-label">Official Contact Email</label>',
        '          <input type="email" class="form-control" ng-model="vm.basicInfo.contact_email" placeholder="support@stagelight.com.gh" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label">Official Contact Phone</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.contact_phone" placeholder="+233 24 000 0000" />',
        '        </div>',
        '      </div>',
        '',
        '      <div class="grid-2 mb-3">',
        '        <div class="card" style="background:var(--bg-subtle);padding:14px;">',
        '          <label class="form-label" style="font-weight:700;">Platform Logo</label>',
        '          <p class="muted" style="font-size:0.8rem;margin:0 0 10px;">Recommended: High-resolution PNG or SVG with transparent background.</p>',
        '          <input type="file" id="slLogoFileInput" style="display:none;" onchange="angular.element(this).scope().vm.onLogoFileChange(this.files)" accept="image/png,image/jpeg,image/svg+xml,image/webp" />',
        '          <div class="inline-actions mb-2">',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.triggerLogoPicker()"><th-icon name="upload" size="14"></th-icon><span>Select Logo File</span></button>',
        '          </div>',
        '          <div class="mt-2" ng-if="vm.basicInfo.logo_url" style="background:#fff;padding:8px;border-radius:4px;display:inline-block;border:1px solid var(--border);">',
        '            <img ng-src="{{ vm.basicInfo.logo_url }}" alt="Logo Preview" style="max-height:55px;max-width:200px;display:block;" />',
        '          </div>',
        '        </div>',
        '        <div class="card" style="background:var(--bg-subtle);padding:14px;">',
        '          <label class="form-label" style="font-weight:700;">Browser Favicon</label>',
        '          <p class="muted" style="font-size:0.8rem;margin:0 0 10px;">Recommended: 32x32 or 64x64 ICO, PNG, or SVG icon.</p>',
        '          <input type="file" id="slFaviconFileInput" style="display:none;" onchange="angular.element(this).scope().vm.onFaviconFileChange(this.files)" accept="image/x-icon,image/png,image/svg+xml,image/jpeg" />',
        '          <div class="inline-actions mb-2">',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.triggerFaviconPicker()"><th-icon name="upload" size="14"></th-icon><span>Select Favicon File</span></button>',
        '          </div>',
        '          <div class="mt-2" ng-if="vm.basicInfo.favicon_url" style="background:#fff;padding:8px;border-radius:4px;display:inline-block;border:1px solid var(--border);">',
        '            <img ng-src="{{ vm.basicInfo.favicon_url }}" alt="Favicon Preview" style="max-height:32px;max-width:32px;display:block;" />',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveBasicInfo()" ng-disabled="vm.savingBasic">',
        '          <th-icon name="check" size="15"></th-icon><span>{{ vm.savingBasic ? "Saving..." : "Save Basic Info" }}</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB: APPLICATION PRICING & COMPETITION FEES -->',
        '    <div ng-if="vm.activeTab === \'pricing\'" class="mt-3">',
        '      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:10px;">',
        '        <div>',
        '          <h1 style="margin:0;font-size:1.5rem;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="tag" size="22"></th-icon>',
        '            <span>Application Fees &amp; Audition Pricing</span>',
        '          </h1>',
        '          <p class="muted mb-0" style="margin:4px 0 0;font-size:0.88rem;">Configure global mandatory application fees for contestants on /apply, and set individual competition fee overrides.</p>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="card mb-3" style="background:var(--bg-subtle);padding:20px;border-radius:12px;">',
        '        <h3 style="margin-top:0;font-size:1.1rem;display:flex;align-items:center;gap:8px;">',
        '          <th-icon name="credit-card" size="18" style="color:var(--gold);"></th-icon>',
        '          <span>Global Default Application Fee</span>',
        '        </h3>',
        '        <div class="grid-3 mb-2" style="gap:16px;">',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Default Audition Fee (GHS) *</label>',
        '            <input type="number" step="0.5" min="0" class="form-control" ng-model="vm.applicationPricing.default_fee_major" placeholder="50.00" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Applies to new competitions unless overridden below.</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Billing Currency</label>',
        '            <input type="text" class="form-control" ng-model="vm.applicationPricing.currency" readonly style="background:var(--bg-card);" />',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Fee Requirement</label>',
        '            <label class="application-checkbox" style="margin-top:8px;display:flex;align-items:center;gap:8px;">',
        '              <input type="checkbox" ng-model="vm.applicationPricing.require_application_fee" />',
        '              <span>Require Fee on /apply</span>',
        '            </label>',
        '          </div>',
        '        </div>',
        '        <div class="mt-2">',
        '          <label class="application-checkbox" style="display:flex;align-items:center;gap:8px;">',
        '            <input type="checkbox" ng-model="vm.applicationPricing.allow_offline_vouchers" />',
        '            <span>Allow Offline Vouchers &amp; Direct Verification Code Entry</span>',
        '          </label>',
        '        </div>',
        '        <div class="mt-3">',
        '          <button type="button" class="btn btn-primary" ng-click="vm.saveApplicationPricing()" ng-disabled="vm.savingPricing">',
        '            <th-icon name="check-circle" size="15"></th-icon><span>{{ vm.savingPricing ? "Saving..." : "Save Pricing Settings" }}</span>',
        '          </button>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="card mb-3" style="padding:20px;border-radius:12px;">',
        '        <div class="flex-between mb-2">',
        '          <div>',
        '            <h3 style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:8px;">',
        '              <th-icon name="trophy" size="18" style="color:var(--gold);"></th-icon>',
        '              <span>Per-Competition Fee Overrides</span>',
        '            </h3>',
        '            <p class="muted" style="margin:3px 0 0;font-size:0.85rem;">Set specific application fees for each active or upcoming competition.</p>',
        '          </div>',
        '        </div>',
        '        <div class="table-responsive" style="overflow-x:auto;">',
        '          <table class="table" style="width:100%;border-collapse:collapse;">',
        '            <thead>',
        '              <tr style="border-bottom:2px solid var(--border);text-align:left;font-size:0.85rem;color:var(--text-muted);">',
        '                <th style="padding:10px 12px;">Competition</th>',
        '                <th style="padding:10px 12px;">Status</th>',
        '                <th style="padding:10px 12px;width:180px;">Fee (GHS)</th>',
        '                <th style="padding:10px 12px;text-align:right;">Action</th>',
        '              </tr>',
        '            </thead>',
        '            <tbody>',
        '              <tr ng-repeat="comp in vm.competitionsPricing" style="border-bottom:1px solid var(--border);">',
        '                <td style="padding:12px;">',
        '                  <strong>{{ comp.title }}</strong>',
        '                  <div class="muted" style="font-size:0.78rem;">Slug: {{ comp.slug }}</div>',
        '                </td>',
        '                <td style="padding:12px;">',
        '                  <span class="badge" ng-class="{\'badge-success\': comp.status===\'VOTING_OPEN\' || comp.status===\'APPLICATIONS_OPEN\', \'badge-secondary\': comp.status!==\'VOTING_OPEN\'}">{{ comp.status }}</span>',
        '                </td>',
        '                <td style="padding:12px;">',
        '                  <div class="input-group" style="display:flex;align-items:center;">',
        '                    <span style="padding:6px 10px;background:var(--bg-subtle);border:1px solid var(--border);border-right:none;border-radius:4px 0 0 4px;font-size:0.85rem;font-weight:700;">GHS</span>',
        '                    <input type="number" step="1" min="0" class="form-control" style="border-radius:0 4px 4px 0;max-width:110px;" ng-model="comp.application_fee_major" />',
        '                  </div>',
        '                </td>',
        '                <td style="padding:12px;text-align:right;">',
        '                  <button type="button" class="btn btn-sm btn-primary" ng-click="vm.updateCompetitionFee(comp)" ng-disabled="comp._saving">',
        '                    <th-icon name="check" size="13"></th-icon>',
        '                    <span>{{ comp._saving ? "Saving..." : "Update Fee" }}</span>',
        '                  </button>',
        '                </td>',
        '              </tr>',
        '              <tr ng-if="!vm.competitionsPricing.length">',
        '                <td colspan="4" class="text-center muted" style="padding:24px;">No competitions registered yet.</td>',
        '              </tr>',
        '            </tbody>',
        '          </table>',
        '        </div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB: SOCIAL MEDIA LINKS -->',
        '    <div ng-if="vm.activeTab === \'social_links\'" class="mt-3">',
        '      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:10px;">',
        '        <div>',
        '          <h1 style="margin:0;font-size:1.5rem;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="share-2" size="22"></th-icon>',
        '            <span>Official Social Media &amp; Community Channels</span>',
        '          </h1>',
        '          <p class="muted mb-0" style="margin:4px 0 0;font-size:0.88rem;">Configure public social profiles, handles, and direct WhatsApp links displayed on the website footer and landing pages.</p>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="card mb-3" style="background:var(--bg-subtle);padding:20px;border-radius:12px;">',
        '        <div class="grid-2" style="gap:20px;">',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip facebook"><th-icon name="facebook" size="14"></th-icon></span> Facebook Page URL',
        '            </label>',
        '            <input type="url" class="form-control" ng-model="vm.socialLinks.facebook_url" placeholder="https://facebook.com/yourpagename" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Direct link to your official Facebook page. Leave blank to hide.</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip instagram"><th-icon name="instagram" size="14"></th-icon></span> Instagram Profile URL',
        '            </label>',
        '            <input type="url" class="form-control" ng-model="vm.socialLinks.instagram_url" placeholder="https://instagram.com/yourhandle" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Direct link to your official Instagram page or account.</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip twitter"><th-icon name="x-twitter" size="14"></th-icon></span> X (Twitter) Profile URL',
        '            </label>',
        '            <input type="url" class="form-control" ng-model="vm.socialLinks.twitter_url" placeholder="https://x.com/yourhandle" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Profile link on X (Twitter).</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip youtube"><th-icon name="youtube" size="14"></th-icon></span> YouTube Channel URL',
        '            </label>',
        '            <input type="url" class="form-control" ng-model="vm.socialLinks.youtube_url" placeholder="https://youtube.com/@yourchannel" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Official YouTube channel link for talent performances and live streams.</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip tiktok"><th-icon name="tiktok" size="14"></th-icon></span> TikTok Profile URL',
        '            </label>',
        '            <input type="url" class="form-control" ng-model="vm.socialLinks.tiktok_url" placeholder="https://tiktok.com/@yourhandle" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Official TikTok handle for short videos and voter challenges.</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip whatsapp"><th-icon name="whatsapp" size="14"></th-icon></span> WhatsApp Support Number or Link',
        '            </label>',
        '            <input type="text" class="form-control" ng-model="vm.socialLinks.whatsapp_number" placeholder="+233240000000 or https://wa.me/233240000000" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Phone number with country code (e.g. +233240000000) or direct wa.me link.</span>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:600;">',
        '              <span class="social-badge-chip linkedin"><th-icon name="linkedin" size="14"></th-icon></span> LinkedIn Page URL',
        '            </label>',
        '            <input type="url" class="form-control" ng-model="vm.socialLinks.linkedin_url" placeholder="https://linkedin.com/company/yourcompany" />',
        '            <span class="field-hint" style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:4px;">Corporate or organizer LinkedIn profile.</span>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Live Preview Card -->',
        '      <div class="card mb-3" style="background:#0b1120;color:#f8fafc;padding:20px;border-radius:12px;border:1px solid #1e293b;">',
        '        <div style="font-size:0.85rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">',
        '          Live Footer Social Icons Preview',
        '        </div>',
        '        <div class="footer-social-links" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">',
        '          <a ng-if="vm.socialLinks.facebook_url" ng-href="{{vm.socialLinks.facebook_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-facebook" title="Facebook">',
        '            <th-icon name="facebook" size="18"></th-icon>',
        '          </a>',
        '          <a ng-if="vm.socialLinks.instagram_url" ng-href="{{vm.socialLinks.instagram_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-instagram" title="Instagram">',
        '            <th-icon name="instagram" size="18"></th-icon>',
        '          </a>',
        '          <a ng-if="vm.socialLinks.twitter_url" ng-href="{{vm.socialLinks.twitter_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-twitter" title="Twitter / X">',
        '            <th-icon name="x-twitter" size="18"></th-icon>',
        '          </a>',
        '          <a ng-if="vm.socialLinks.youtube_url" ng-href="{{vm.socialLinks.youtube_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-youtube" title="YouTube">',
        '            <th-icon name="youtube" size="18"></th-icon>',
        '          </a>',
        '          <a ng-if="vm.socialLinks.tiktok_url" ng-href="{{vm.socialLinks.tiktok_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-tiktok" title="TikTok">',
        '            <th-icon name="tiktok" size="18"></th-icon>',
        '          </a>',
        '          <a ng-if="vm.socialLinks.whatsapp_number" ng-href="{{vm.getWhatsAppUrl(vm.socialLinks.whatsapp_number)}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-whatsapp" title="WhatsApp">',
        '            <th-icon name="whatsapp" size="18"></th-icon>',
        '          </a>',
        '          <a ng-if="vm.socialLinks.linkedin_url" ng-href="{{vm.socialLinks.linkedin_url}}" target="_blank" rel="noopener noreferrer" class="footer-social-btn social-linkedin" title="LinkedIn">',
        '            <th-icon name="linkedin" size="18"></th-icon>',
        '          </a>',
        '        </div>',
        '        <div class="muted mt-2" style="font-size:0.8rem;color:#64748b;">Only channels with a valid link or number entered above will appear on the public site footer.</div>',
        '      </div>',
        '',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveSocialLinks()" ng-disabled="vm.savingSocial">',
        '          <th-icon name="check" size="15"></th-icon><span>{{ vm.savingSocial ? "Saving..." : "Save Social Media Links" }}</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB: INTEGRATIONS (Payment Gateways, SMS & Telecom, Email SMTP, Webhooks) -->',
        '    <div ng-if="vm.activeTab === \'integrations\' || vm.activeTab === \'payment_gateway\' || vm.activeTab === \'sms_config\' || vm.activeTab === \'email_config\'" class="mt-3">',
        '      <div class="flex-between mb-3" style="flex-wrap:wrap;gap:12px;">',
        '        <div>',
        '          <h1 style="margin:0;font-size:1.5rem;display:flex;align-items:center;gap:10px;">',
        '            <th-icon name="plug" size="24" style="color:var(--accent,#d97706);"></th-icon>',
        '            <span>Integrations &amp; API Gateways</span>',
        '          </h1>',
        '          <p class="muted mb-0" style="margin:4px 0 0;font-size:0.88rem;">Self-service setup for payment processors, mobile money aggregators, SMS delivery, transactional email, and webhooks.</p>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <button type="button" class="btn btn-primary" ng-click="vm.saveAllIntegrations()" ng-disabled="vm.savingIntegrations">',
        '            <th-icon name="check-circle" size="15"></th-icon><span>{{ vm.savingIntegrations ? "Saving All..." : "Save All Integrations" }}</span>',
        '          </button>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Sub-Navigation Pills -->',
        '      <div class="integration-subnav">',
        '        <button type="button" class="integration-subnav-btn" ng-class="{active: vm.integrationSubTab === \'payments\'}" ng-click="vm.setIntegrationSubTab(\'payments\')">',
        '          <th-icon name="credit-card" size="16"></th-icon>',
        '          <span>Payment Gateways</span>',
        '          <span class="badge badge-sm" style="font-size:0.75rem;padding:2px 7px;" ng-class="{\'badge-success\': vm.paymentConfig.environment === \'live\', \'badge-warning\': vm.paymentConfig.environment === \'sandbox\'}">{{ vm.paymentConfig.active_provider | uppercase }}</span>',
        '        </button>',
        '        <button type="button" class="integration-subnav-btn" ng-class="{active: vm.integrationSubTab === \'sms\'}" ng-click="vm.setIntegrationSubTab(\'sms\')">',
        '          <th-icon name="mail" size="16"></th-icon>',
        '          <span>SMS &amp; Telecom</span>',
        '          <span class="badge badge-sm badge-info" style="font-size:0.75rem;padding:2px 7px;">{{ vm.smsConfig.provider | uppercase }}</span>',
        '        </button>',
        '        <button type="button" class="integration-subnav-btn" ng-class="{active: vm.integrationSubTab === \'email\'}" ng-click="vm.setIntegrationSubTab(\'email\')">',
        '          <th-icon name="mail" size="16"></th-icon>',
        '          <span>Transactional Email (SMTP)</span>',
        '          <span class="badge badge-sm badge-success" style="font-size:0.75rem;padding:2px 7px;">{{ vm.emailConfig.use_tls ? "TLS" : "PLAIN" }}</span>',
        '        </button>',
        '        <button type="button" class="integration-subnav-btn" ng-class="{active: vm.integrationSubTab === \'webhooks\'}" ng-click="vm.setIntegrationSubTab(\'webhooks\')">',
        '          <th-icon name="clipboard-check" size="16"></th-icon>',
        '          <span>Webhooks &amp; Callbacks</span>',
        '        </button>',
        '      </div>',
        '',
        '      <!-- SUBTAB 1: PAYMENT GATEWAYS -->',
        '      <div ng-if="vm.integrationSubTab === \'payments\'">',
        '        <!-- Global Payment Engine Configuration -->',
        '        <div class="card mb-3" style="background:var(--bg-subtle);padding:18px;border-radius:10px;">',
        '          <h3 style="margin:0 0 12px;font-size:1.05rem;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="sliders" size="16" style="color:var(--accent,#d97706);"></th-icon>',
        '            <span>Active Primary Gateway &amp; Currency Rules</span>',
        '          </h3>',
        '          <div class="grid-3 mb-3" style="gap:16px;">',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Active Primary Gateway *</label>',
        '              <select class="form-control" ng-model="vm.paymentConfig.active_provider">',
        '                <option value="mock">GhanaPay Sandbox / Mock (Simulated Payments)</option>',
        '                <option value="paystack">Paystack Ghana (MoMo &amp; Cards)</option>',
        '                <option value="hubtel">Hubtel Ghana (Direct MoMo Aggregator)</option>',
        '                <option value="flutterwave">Flutterwave Ghana</option>',
        '              </select>',
        '              <span class="field-hint" style="font-size:0.78rem;color:var(--text-muted);display:block;margin-top:4px;">Determines which payment processor handles public voter checkouts.</span>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Processing Mode</label>',
        '              <select class="form-control" ng-model="vm.paymentConfig.environment">',
        '                <option value="sandbox">Sandbox / Test Mode</option>',
        '                <option value="live">Live / Production Collections</option>',
        '              </select>',
        '              <span class="field-hint" style="font-size:0.78rem;color:var(--text-muted);display:block;margin-top:4px;">Always test in Sandbox first before switching to Live collections.</span>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Settlement Currency</label>',
        '              <input type="text" class="form-control" ng-model="vm.paymentConfig.currency" placeholder="GHS" />',
        '              <span class="field-hint" style="font-size:0.78rem;color:var(--text-muted);display:block;margin-top:4px;">Default currency for vote packages &amp; application fees.</span>',
        '            </div>',
        '          </div>',
        '          <div class="grid-4 mb-3" style="gap:16px;">',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Min. Purchase (GHS)</label>',
        '              <input type="number" step="0.5" class="form-control" ng-model="vm.paymentConfig.min_amount_ghs" />',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Daily Cap per Voter (GHS)</label>',
        '              <input type="number" step="100" class="form-control" ng-model="vm.paymentConfig.max_daily_spend_ghs" />',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Platform Fee (%)</label>',
        '              <input type="number" step="0.1" class="form-control" ng-model="vm.paymentConfig.platform_fee_percent" />',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Sandbox Auto-Settle</label>',
        '              <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;margin-top:8px;">',
        '                <input type="checkbox" ng-model="vm.paymentConfig.auto_settle_mock" />',
        '                <span>Auto-settle test orders</span>',
        '              </label>',
        '            </div>',
        '          </div>',
        '          <div style="display:flex;flex-wrap:wrap;gap:20px;padding-top:12px;border-top:1px solid var(--border);">',
        '            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.paymentConfig.allow_mobile_money" />',
        '              <strong>Accept Mobile Money</strong> (MTN MoMo, Telecel Cash, AT Money)',
        '            </label>',
        '            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.paymentConfig.allow_card" />',
        '              <strong>Accept Bank Cards</strong> (Visa, Mastercard, Verve)',
        '            </label>',
        '          </div>',
        '        </div>',
        '',
        '        <!-- 1. PAYSTACK GHANA -->',
        '        <div class="card mb-3" style="border-left:4px solid #059669;" ng-class="{\'shadow-sm\': vm.paymentConfig.active_provider === \'paystack\'}">',
        '          <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">',
        '            <div>',
        '              <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '                <th-icon name="credit-card" size="18" style="color:#059669;"></th-icon>',
        '                <span>Paystack Ghana Integration</span>',
        '                <span class="badge badge-success" ng-if="vm.paymentConfig.active_provider === \'paystack\'">ACTIVE PRIMARY</span>',
        '              </h3>',
        '              <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Accepts MTN MoMo, Telecel Cash, AT Money, and Cards with instant webhook settlement.</p>',
        '            </div>',
        '            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.paymentConfig.paystack.enabled" />',
        '              <strong>Enable Paystack</strong>',
        '            </label>',
        '          </div>',
        '',
        '          <div class="integration-guide-box guide-success">',
        '            <div class="integration-guide-title">',
        '              <th-icon name="clipboard-check" size="15" style="color:#059669;"></th-icon>',
        '              <span>Self-Setup Paystack Guide:</span>',
        '            </div>',
        '            <ol class="integration-guide-steps">',
        '              <li>Log into your <a href="https://dashboard.paystack.com/#/settings/developer" target="_blank" rel="noopener noreferrer" style="color:#059669;text-decoration:underline;">Paystack Dashboard &rarr; Settings &rarr; API Keys &amp; Webhooks</a>.</li>',
        '              <li>Copy your <strong>Public Key</strong> (starts with <code>pk_test_</code> or <code>pk_live_</code>) and <strong>Secret Key</strong> (starts with <code>sk_test_</code> or <code>sk_live_</code>).</li>',
        '              <li>Copy the Webhook Endpoint URL below and paste it into the <strong>Live Webhook URL</strong> and <strong>Test Webhook URL</strong> fields in Paystack.</li>',
        '            </ol>',
        '          </div>',
        '',
        '          <div class="grid-2 mb-3">',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Paystack Public Key *</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.paystack_public ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.paystack.public_key" placeholder="pk_test_... or pk_live_..." />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'paystack_public\')" title="{{ vm.showSecrets.paystack_public ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.paystack_public ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '              <span class="field-hint" style="font-size:0.76rem;color:var(--text-muted);display:block;margin-top:3px;">Client-side key used for secure checkout initialization on public voting.</span>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Paystack Secret Key *</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.paystack_secret ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.paystack.secret_key" placeholder="sk_test_... or sk_live_..." />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'paystack_secret\')" title="{{ vm.showSecrets.paystack_secret ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.paystack_secret ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '              <span class="field-hint" style="font-size:0.76rem;color:var(--text-muted);display:block;margin-top:3px;">Confidential server secret key used for transaction verification and settlements.</span>',
        '            </div>',
        '          </div>',
        '',
        '          <div class="grid-2 mb-3">',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Webhook Secret / Signature Hash</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.paystack_webhook ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.paystack.webhook_secret" placeholder="Secret hash for HMAC verification" />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'paystack_webhook\')" title="{{ vm.showSecrets.paystack_webhook ? \'Hide secret\' : \'Show secret\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.paystack_webhook ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '              <span class="field-hint" style="font-size:0.76rem;color:var(--text-muted);display:block;margin-top:3px;">Verifies genuine Paystack webhook events (HMAC-SHA512).</span>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Paystack API Base URL</label>',
        '              <input type="text" class="form-control" ng-model="vm.paymentConfig.paystack.base_url" placeholder="https://api.paystack.co" />',
        '            </div>',
        '          </div>',
        '',
        '          <div class="copyable-url-box mb-3">',
        '            <div>',
        '              <span class="muted" style="font-size:0.78rem;font-weight:700;text-transform:uppercase;">Paystack Webhook URL:</span>',
        '              <div class="copyable-url-text">{{ vm.getWebhookUrl(\'paystack\') }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'paystack\'), \'Paystack Webhook URL\')">',
        '              <th-icon name="copy" size="13"></th-icon><span>Copy Webhook URL</span>',
        '            </button>',
        '          </div>',
        '',
        '          <div class="inline-actions" style="gap:10px;">',
        '            <button type="button" class="btn btn-primary btn-sm" ng-click="vm.savePaymentConfig()" ng-disabled="vm.savingPayment">',
        '              <th-icon name="check" size="13"></th-icon><span>{{ vm.savingPayment ? "Saving..." : "Save Paystack Config" }}</span>',
        '            </button>',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.testPaymentGateway(\'paystack\')" ng-disabled="vm.testingPaymentGateway">',
        '              <th-icon name="refresh" size="13"></th-icon><span>{{ vm.testingPaymentGateway ? "Verifying..." : "Test Paystack Connection" }}</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '',
        '        <!-- 2. HUBTEL GHANA -->',
        '        <div class="card mb-3" style="border-left:4px solid #d97706;" ng-class="{\'shadow-sm\': vm.paymentConfig.active_provider === \'hubtel\'}">',
        '          <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">',
        '            <div>',
        '              <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '                <th-icon name="credit-card" size="18" style="color:#d97706;"></th-icon>',
        '                <span>Hubtel Ghana Direct MoMo Aggregator</span>',
        '                <span class="badge badge-warning" ng-if="vm.paymentConfig.active_provider === \'hubtel\'">ACTIVE PRIMARY</span>',
        '              </h3>',
        '              <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Direct telecom aggregator for Ghanaian Mobile Money networks.</p>',
        '            </div>',
        '            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.paymentConfig.hubtel.enabled" />',
        '              <strong>Enable Hubtel</strong>',
        '            </label>',
        '          </div>',
        '',
        '          <div class="integration-guide-box guide-warning">',
        '            <div class="integration-guide-title">',
        '              <th-icon name="clipboard-check" size="15" style="color:#d97706;"></th-icon>',
        '              <span>Self-Setup Hubtel Guide:</span>',
        '            </div>',
        '            <ol class="integration-guide-steps">',
        '              <li>Log into your <a href="https://unity.hubtel.com" target="_blank" rel="noopener noreferrer" style="color:#d97706;text-decoration:underline;">Hubtel Merchant Portal</a> &rarr; Developer &rarr; API Keys.</li>',
        '              <li>Copy your <strong>Client ID</strong>, <strong>Client Secret</strong>, and <strong>Merchant Account Number</strong>.</li>',
        '              <li>Set the Callback URL in your Hubtel dashboard to the URL below.</li>',
        '            </ol>',
        '          </div>',
        '',
        '          <div class="grid-3 mb-3">',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Client ID *</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.hubtel_id ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.hubtel.client_id" placeholder="Hubtel API Client ID" />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'hubtel_id\')" title="{{ vm.showSecrets.hubtel_id ? \'Hide ID\' : \'Show ID\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.hubtel_id ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Client Secret *</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.hubtel_secret ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.hubtel.client_secret" placeholder="Hubtel Client Secret" />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'hubtel_secret\')" title="{{ vm.showSecrets.hubtel_secret ? \'Hide secret\' : \'Show secret\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.hubtel_secret ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Merchant Account Number *</label>',
        '              <input type="text" class="form-control" ng-model="vm.paymentConfig.hubtel.merchant_account_number" placeholder="e.g. 2018892" />',
        '            </div>',
        '          </div>',
        '',
        '          <div class="copyable-url-box mb-3">',
        '            <div>',
        '              <span class="muted" style="font-size:0.78rem;font-weight:700;text-transform:uppercase;">Hubtel Callback URL:</span>',
        '              <div class="copyable-url-text">{{ vm.getWebhookUrl(\'hubtel\') }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'hubtel\'), \'Hubtel Webhook URL\')">',
        '              <th-icon name="copy" size="13"></th-icon><span>Copy Callback URL</span>',
        '            </button>',
        '          </div>',
        '',
        '          <div class="inline-actions" style="gap:10px;">',
        '            <button type="button" class="btn btn-primary btn-sm" ng-click="vm.savePaymentConfig()" ng-disabled="vm.savingPayment">',
        '              <th-icon name="check" size="13"></th-icon><span>Save Hubtel Config</span>',
        '            </button>',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.testPaymentGateway(\'hubtel\')" ng-disabled="vm.testingPaymentGateway">',
        '              <th-icon name="refresh" size="13"></th-icon><span>Test Hubtel Connection</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '',
        '        <!-- 3. FLUTTERWAVE -->',
        '        <div class="card mb-3" style="border-left:4px solid #f59e0b;" ng-class="{\'shadow-sm\': vm.paymentConfig.active_provider === \'flutterwave\'}">',
        '          <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">',
        '            <div>',
        '              <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '                <th-icon name="credit-card" size="18" style="color:#f59e0b;"></th-icon>',
        '                <span>Flutterwave Ghana Integration</span>',
        '                <span class="badge badge-warning" ng-if="vm.paymentConfig.active_provider === \'flutterwave\'">ACTIVE PRIMARY</span>',
        '              </h3>',
        '              <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Pan-African and international cards &amp; wallets.</p>',
        '            </div>',
        '            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.paymentConfig.flutterwave.enabled" />',
        '              <strong>Enable Flutterwave</strong>',
        '            </label>',
        '          </div>',
        '',
        '          <div class="grid-3 mb-3">',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Public Key</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.flutterwave_public ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.flutterwave.public_key" placeholder="FLWPUBK_TEST-..." />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'flutterwave_public\')" title="{{ vm.showSecrets.flutterwave_public ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.flutterwave_public ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Secret Key</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.flutterwave_secret ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.flutterwave.secret_key" placeholder="FLWSECK_TEST-..." />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'flutterwave_secret\')" title="{{ vm.showSecrets.flutterwave_secret ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.flutterwave_secret ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Encryption Key / Webhook Hash</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.flutterwave_hash ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.paymentConfig.flutterwave.encryption_key" placeholder="Encryption key or hash" />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'flutterwave_hash\')" title="{{ vm.showSecrets.flutterwave_hash ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.flutterwave_hash ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '          </div>',
        '',
        '          <div class="copyable-url-box mb-3">',
        '            <div>',
        '              <span class="muted" style="font-size:0.78rem;font-weight:700;text-transform:uppercase;">Flutterwave Webhook URL:</span>',
        '              <div class="copyable-url-text">{{ vm.getWebhookUrl(\'flutterwave\') }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'flutterwave\'), \'Flutterwave Webhook URL\')">',
        '              <th-icon name="copy" size="13"></th-icon><span>Copy Webhook URL</span>',
        '            </button>',
        '          </div>',
        '',
        '          <div class="inline-actions" style="gap:10px;">',
        '            <button type="button" class="btn btn-primary btn-sm" ng-click="vm.savePaymentConfig()" ng-disabled="vm.savingPayment">',
        '              <th-icon name="check" size="13"></th-icon><span>Save Flutterwave Config</span>',
        '            </button>',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.testPaymentGateway(\'flutterwave\')" ng-disabled="vm.testingPaymentGateway">',
        '              <th-icon name="refresh" size="13"></th-icon><span>Test Flutterwave Connection</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '',
        '        <!-- 4. GHANAPAY SANDBOX / MOCK SIMULATOR -->',
        '        <div class="card mb-3" style="border-left:4px solid #6366f1;">',
        '          <div class="flex-between mb-2">',
        '            <div>',
        '              <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;">',
        '                <th-icon name="shield" size="18" style="color:#6366f1;"></th-icon>',
        '                <span>GhanaPay Sandbox Gateway (Offline Mock)</span>',
        '                <span class="badge badge-info" ng-if="vm.paymentConfig.active_provider === \'mock\'">ACTIVE SIMULATOR</span>',
        '              </h3>',
        '              <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Built-in local simulator for instant voter checkout testing without requiring external credentials.</p>',
        '            </div>',
        '            <span class="badge badge-success">Always Available</span>',
        '          </div>',
        '          <div class="muted mb-3" style="font-size:0.85rem;line-height:1.45;">Simulates instant Mobile Money prompt popups and auto-settles votes directly in the database. Perfect for staging demos, local development, and staff training.</div>',
        '          <div class="inline-actions">',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.testPaymentGateway(\'mock\')" ng-disabled="vm.testingPaymentGateway">',
        '              <th-icon name="refresh" size="13"></th-icon><span>Test Mock Simulator</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '',
        '        <!-- Diagnostic Test Results Box -->',
        '        <div class="card mb-3" ng-if="vm.testGatewayResult" style="padding:16px;border:1px solid var(--border);" ng-style="vm.testGatewayResult.success ? {\'border-color\': \'#059669\', \'background\': \'rgba(5, 150, 105, 0.05)\'} : {\'border-color\': \'#dc2626\', \'background\': \'rgba(220, 38, 38, 0.05)\'}">',
        '          <div style="display:flex;align-items:flex-start;gap:12px;">',
        '            <th-icon name="{{ vm.testGatewayResult.success ? \'check-circle\' : \'shield-alert\' }}" size="22" style="color: {{ vm.testGatewayResult.success ? \'#059669\' : \'#dc2626\' }};flex-shrink:0;margin-top:2px;"></th-icon>',
        '            <div style="flex:1;">',
        '              <div style="display:flex;align-items:center;gap:8px;">',
        '                <strong>{{ vm.testGatewayResult.success ? "Gateway Connection Verified" : "Gateway Verification Alert" }}</strong>',
        '                <span class="badge" ng-class="{\'badge-success\': vm.testGatewayResult.success, \'badge-warning\': !vm.testGatewayResult.success}">{{ vm.testGatewayResult.provider | uppercase }}</span>',
        '              </div>',
        '              <p style="margin:5px 0 0;font-size:0.88rem;">{{ vm.testGatewayResult.message }}</p>',
        '              <div class="muted" style="font-size:0.76rem;margin-top:4px;">Diagnostic run at: {{ vm.testGatewayResult.timestamp | date:\'medium\' }}</div>',
        '            </div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- SUBTAB 2: SMS & TELECOM -->',
        '      <div ng-if="vm.integrationSubTab === \'sms\'">',
        '        <div class="card mb-3" style="border-left:4px solid #0284c7;">',
        '          <div class="flex-between mb-2">',
        '            <div>',
        '              <h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:8px;">',
        '                <th-icon name="mail" size="18" style="color:#0284c7;"></th-icon>',
        '                <span>Telecom SMS Aggregator Configuration</span>',
        '              </h3>',
        '              <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Dispatches automated vote receipts, contestant shortcodes, and broadcast notices to voter phone numbers.</p>',
        '            </div>',
        '            <span class="badge badge-info">{{ vm.smsConfig.provider | uppercase }}</span>',
        '          </div>',
        '',
        '          <div class="integration-guide-box">',
        '            <div class="integration-guide-title">',
        '              <th-icon name="clipboard-check" size="15" style="color:#0284c7;"></th-icon>',
        '              <span>Self-Service SMS Setup Guide:</span>',
        '            </div>',
        '            <ol class="integration-guide-steps">',
        '              <li>Register an account with your telecom SMS provider (<a href="https://arkesel.com" target="_blank" rel="noopener noreferrer" style="color:#0284c7;text-decoration:underline;">Arkesel Ghana</a>, <a href="https://hubtel.com" target="_blank" rel="noopener noreferrer" style="color:#0284c7;text-decoration:underline;">Hubtel SMS</a>, or <a href="https://mnotify.com" target="_blank" rel="noopener noreferrer" style="color:#0284c7;text-decoration:underline;">MNotify Ghana</a>).</li>',
        '              <li>Generate an API Key / Secret Token from the provider dashboard and paste below.</li>',
        '              <li>Register and approve your Alphanumeric Sender ID (e.g. <code>StageLight</code>) to comply with NCA regulations in Ghana.</li>',
        '            </ol>',
        '          </div>',
        '',
        '          <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Provider Gateway *</label>',
        '              <select class="form-control" ng-model="vm.smsConfig.provider">',
        '                <option value="arkesel">Arkesel (Ghana)</option>',
        '                <option value="hubtel">Hubtel (Ghana)</option>',
        '                <option value="mnotify">MNotify (Ghana)</option>',
        '                <option value="twilio">Twilio (Global)</option>',
        '              </select>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">API Key / Secret Token *</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.sms_key ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.smsConfig.api_key" placeholder="Enter provider API key" />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'sms_key\')" title="{{ vm.showSecrets.sms_key ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.sms_key ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Registered Sender ID *</label>',
        '              <input type="text" class="form-control" ng-model="vm.smsConfig.sender_id" placeholder="StageLight" maxlength="11" />',
        '              <span class="field-hint" style="font-size:0.76rem;color:var(--text-muted);display:block;margin-top:3px;">Max 11 alphanumeric characters (e.g. StageLight).</span>',
        '            </div>',
        '          </div>',
        '',
        '          <!-- SMS Live Test Box -->',
        '          <div class="card mb-3" style="background:var(--bg-subtle);padding:14px;border:1px dashed var(--border);">',
        '            <label class="form-label" style="font-weight:700;">Dispatch Live Test SMS</label>',
        '            <div class="grid-2" style="gap:12px;">',
        '              <div>',
        '                <input type="text" class="form-control" ng-model="vm.smsConfig.test_phone" placeholder="Recipient Phone (e.g. +233241234567 or 0241234567)" />',
        '                <span class="field-hint" style="font-size:0.76rem;color:var(--text-muted);display:block;margin-top:3px;">Enter your phone number with country code to test gateway delivery.</span>',
        '              </div>',
        '              <div class="inline-actions">',
        '                <button type="button" class="btn btn-secondary" ng-click="vm.sendSmsTest()" ng-disabled="vm.sendingSmsTest">',
        '                  <th-icon name="mail" size="14"></th-icon><span>{{ vm.sendingSmsTest ? "Sending Test..." : "Send Test SMS" }}</span>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div ng-if="vm.smsTestResult" class="mt-2" style="font-size:0.84rem;padding:8px 12px;border-radius:6px;" ng-style="vm.smsTestResult.sent ? {\'background\': \'rgba(5, 150, 105, 0.1)\', \'color\': \'#059669\'} : {\'background\': \'rgba(220, 38, 38, 0.1)\', \'color\': \'#dc2626\'}">',
        '              <strong>{{ vm.smsTestResult.sent ? "Success:" : "Notice:" }}</strong> {{ vm.smsTestResult.message }}',
        '            </div>',
        '          </div>',
        '',
        '          <div class="inline-actions">',
        '            <button type="button" class="btn btn-primary" ng-click="vm.saveSmsConfig()" ng-disabled="vm.savingSms">',
        '              <th-icon name="check" size="15"></th-icon><span>{{ vm.savingSms ? "Saving..." : "Save SMS Configuration" }}</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- SUBTAB 3: TRANSACTIONAL EMAIL / SMTP -->',
        '      <div ng-if="vm.integrationSubTab === \'email\'">',
        '        <div class="card mb-3" style="border-left:4px solid #8b5cf6;">',
        '          <div class="flex-between mb-2">',
        '            <div>',
        '              <h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:8px;">',
        '                <th-icon name="mail" size="18" style="color:#8b5cf6;"></th-icon>',
        '                <span>Transactional Email Configuration (SMTP)</span>',
        '              </h3>',
        '              <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Handles contestant acceptance notices, audition vouchers, receipt emails, and administrative alerts.</p>',
        '            </div>',
        '            <span class="badge badge-success">TLS: {{ vm.emailConfig.use_tls ? "ENABLED" : "OFF" }}</span>',
        '          </div>',
        '',
        '          <!-- Presets -->',
        '          <div class="mb-3" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">',
        '            <span style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);">Quick Presets:</span>',
        '            <button type="button" class="preset-chip" ng-click="vm.applyEmailPreset(\'sendgrid\')">SendGrid</button>',
        '            <button type="button" class="preset-chip" ng-click="vm.applyEmailPreset(\'mailgun\')">Mailgun</button>',
        '            <button type="button" class="preset-chip" ng-click="vm.applyEmailPreset(\'gmail\')">Google Workspace</button>',
        '          </div>',
        '',
        '          <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">SMTP Server Host *</label>',
        '              <input type="text" class="form-control" ng-model="vm.emailConfig.server" placeholder="smtp.sendgrid.net" />',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">SMTP Port *</label>',
        '              <input type="number" class="form-control" ng-model="vm.emailConfig.port" placeholder="587" />',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Security Protocol</label>',
        '              <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;margin-top:8px;">',
        '                <input type="checkbox" ng-model="vm.emailConfig.use_tls" /> <strong>Use TLS Encryption</strong>',
        '              </label>',
        '            </div>',
        '          </div>',
        '',
        '          <div class="grid-3 mb-3">',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">SMTP Username</label>',
        '              <input type="text" class="form-control" ng-model="vm.emailConfig.username" placeholder="apikey or smtp@yourdomain.com" />',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">SMTP Password / API Key</label>',
        '              <div class="input-with-action">',
        '                <input type="{{ vm.showSecrets.email_password ? \'text\' : \'password\' }}" class="form-control" ng-model="vm.emailConfig.password" placeholder="Enter password or token" />',
        '                <button type="button" class="btn-icon-addon" ng-click="vm.toggleSecret(\'email_password\')" title="{{ vm.showSecrets.email_password ? \'Hide key\' : \'Show key\' }}">',
        '                  <th-icon name="{{ vm.showSecrets.email_password ? \'eye-off\' : \'eye\' }}" size="15"></th-icon>',
        '                </button>',
        '              </div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:600;">Default Sender Address</label>',
        '              <input type="text" class="form-control" ng-model="vm.emailConfig.default_sender" placeholder="StageLight Ghana &lt;noreply@stagelight.com.gh&gt;" />',
        '            </div>',
        '          </div>',
        '',
        '          <!-- Email Live Test Box -->',
        '          <div class="card mb-3" style="background:var(--bg-subtle);padding:14px;border:1px dashed var(--border);">',
        '            <label class="form-label" style="font-weight:700;">Dispatch Live Test Email</label>',
        '            <p class="muted" style="font-size:0.8rem;margin:0 0 10px;">Sends a test message through the configured SMTP server to verify credentials and sender reputation.</p>',
        '            <div class="inline-actions">',
        '              <button type="button" class="btn btn-secondary" ng-click="vm.sendEmailTest()" ng-disabled="vm.sendingEmailTest">',
        '                <th-icon name="mail" size="14"></th-icon><span>{{ vm.sendingEmailTest ? "Sending Test..." : "Send Test Email" }}</span>',
        '              </button>',
        '            </div>',
        '            <div ng-if="vm.emailTestResult" class="mt-2" style="font-size:0.84rem;padding:8px 12px;border-radius:6px;" ng-style="vm.emailTestResult.sent ? {\'background\': \'rgba(5, 150, 105, 0.1)\', \'color\': \'#059669\'} : {\'background\': \'rgba(220, 38, 38, 0.1)\', \'color\': \'#dc2626\'}">',
        '              <strong>{{ vm.emailTestResult.sent ? "Success:" : "Notice:" }}</strong> {{ vm.emailTestResult.message }}',
        '            </div>',
        '          </div>',
        '',
        '          <div class="inline-actions">',
        '            <button type="button" class="btn btn-primary" ng-click="vm.saveEmailConfig()" ng-disabled="vm.savingEmail">',
        '              <th-icon name="check" size="15"></th-icon><span>{{ vm.savingEmail ? "Saving..." : "Save Email Configuration" }}</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- SUBTAB 4: WEBHOOKS & CALLBACKS -->',
        '      <div ng-if="vm.integrationSubTab === \'webhooks\'">',
        '        <div class="card mb-3" style="border-left:4px solid #10b981;">',
        '          <h3 style="margin:0 0 8px;font-size:1.15rem;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="clipboard-check" size="18" style="color:#10b981;"></th-icon>',
        '            <span>Webhook Endpoints &amp; Instant Settlement Engine</span>',
        '          </h3>',
        '          <p class="muted mb-3" style="font-size:0.88rem;line-height:1.5;">When voters initiate payments via MTN MoMo, Telecel Cash, or cards, provider gateways notify StageLight via cryptographic HTTP POST webhooks to immediately fulfill votes and update the competition ledger.</p>',
        '',
        '          <div style="display:flex;flex-direction:column;gap:14px;">',
        '            <div class="copyable-url-box">',
        '              <div>',
        '                <div style="display:flex;align-items:center;gap:8px;">',
        '                  <strong style="font-size:0.9rem;">Paystack Webhook Endpoint</strong>',
        '                  <span class="badge badge-success">POST</span>',
        '                </div>',
        '                <div class="copyable-url-text mt-1">{{ vm.getWebhookUrl(\'paystack\') }}</div>',
        '                <div class="muted mt-1" style="font-size:0.78rem;">Listens for: <code>charge.success</code>, verified via HMAC-SHA512.</div>',
        '              </div>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'paystack\'), \'Paystack Webhook URL\')">',
        '                <th-icon name="copy" size="13"></th-icon><span>Copy URL</span>',
        '              </button>',
        '            </div>',
        '',
        '            <div class="copyable-url-box">',
        '              <div>',
        '                <div style="display:flex;align-items:center;gap:8px;">',
        '                  <strong style="font-size:0.9rem;">Hubtel Callback Endpoint</strong>',
        '                  <span class="badge badge-warning">POST</span>',
        '                </div>',
        '                <div class="copyable-url-text mt-1">{{ vm.getWebhookUrl(\'hubtel\') }}</div>',
        '                <div class="muted mt-1" style="font-size:0.78rem;">Direct telecom status callback for mobile money prompt completion.</div>',
        '              </div>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'hubtel\'), \'Hubtel Webhook URL\')">',
        '                <th-icon name="copy" size="13"></th-icon><span>Copy URL</span>',
        '              </button>',
        '            </div>',
        '',
        '            <div class="copyable-url-box">',
        '              <div>',
        '                <div style="display:flex;align-items:center;gap:8px;">',
        '                  <strong style="font-size:0.9rem;">Flutterwave Webhook Endpoint</strong>',
        '                  <span class="badge badge-warning">POST</span>',
        '                </div>',
        '                <div class="copyable-url-text mt-1">{{ vm.getWebhookUrl(\'flutterwave\') }}</div>',
        '                <div class="muted mt-1" style="font-size:0.78rem;">Verified using the secret hash configured in Flutterwave dashboard.</div>',
        '              </div>',
        '              <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'flutterwave\'), \'Flutterwave Webhook URL\')">',
        '                <th-icon name="copy" size="13"></th-icon><span>Copy URL</span>',
        '              </button>',
        '            </div>',
        '          </div>',
        '',
        '          <div class="mt-3 p-3" style="background:var(--bg-subtle);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">',
        '            <div style="font-size:0.84rem;color:var(--text-secondary);">',
        '              Want to inspect received webhook events or troubleshoot failed payment callbacks?',
        '            </div>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.switchTab(\'logs\')">',
        '              <th-icon name="history" size="13"></th-icon><span>View Audit &amp; Event Logs</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB 4: BACKUP -->',
        '    <div ng-if="vm.activeTab === \'backup\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">System Backup &amp; Database Snapshots</h1>',
        '      <p class="muted mb-3" style="font-size:0.88rem;">Manage automated archival schedules and trigger immediate complete database and upload snapshots.</p>',
        '',
        '      <div class="card mb-3" style="background:var(--bg-subtle);padding:14px;">',
        '        <div class="grid-2 mb-3">',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Automated Snapshot Schedule</label>',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.backupConfig.auto_backup_enabled" /> Enable Background Database Snapshots',
        '            </label>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Frequency</label>',
        '            <select class="form-control" ng-model="vm.backupConfig.schedule">',
        '              <option value="daily">Daily (Nightly at 02:00 UTC)</option>',
        '              <option value="weekly">Weekly (Sundays at 03:00 UTC)</option>',
        '              <option value="monthly">Monthly</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Storage Repository Path</label>',
        '          <input type="text" class="form-control" ng-model="vm.backupConfig.storage_path" readonly />',
        '        </div>',
        '      </div>',
        '',
        '      <div class="inline-actions mb-3">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveBackupConfig()" ng-disabled="vm.savingBackup">',
        '          <th-icon name="check" size="15"></th-icon><span>{{ vm.savingBackup ? "Saving..." : "Save Backup Schedule" }}</span>',
        '        </button>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.triggerBackup()" ng-disabled="vm.triggeringBackup">',
        '          <th-icon name="download" size="15"></th-icon><span>{{ vm.triggeringBackup ? "Creating Snapshot..." : "Trigger Manual Backup Now" }}</span>',
        '        </button>',
        '      </div>',
        '',
        '      <div class="card" ng-if="vm.backupConfig.last_backup" style="background:var(--bg-subtle);padding:12px 16px;border-left:4px solid var(--primary);">',
        '        <span class="muted" style="font-size:0.85rem;">Last Successful Snapshot:</span>',
        '        <div style="font-weight:600;font-size:0.95rem;margin-top:2px;">{{ vm.backupConfig.last_backup }}</div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB 5: AUDIT LOGS -->',
        '    <div ng-if="vm.activeTab === \'logs\'" class="mt-3">',
        '      <div class="flex-between mb-2">',
        '        <div>',
        '          <h1 style="margin:0;font-size:1.5rem;">Audit &amp; Security Logs</h1>',
        '          <p class="muted" style="margin:4px 0 0;font-size:0.88rem;">Append-only ledger of all administrative interventions, settings changes, and RBAC events.</p>',
        '        </div>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadLogs()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="history" size="14"></th-icon><span>Filter Audit Trail</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.logs.meta.total !== undefined ? vm.logs.meta.total : vm.logs.items.length }} event(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.logs.filters.q || vm.logs.filters.entity_type || vm.logs.filters.action" ng-click="vm.resetLogFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Events</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.logs.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadLogs()" placeholder="Action, entity, or actor..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Entity Type</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.logs.filters.entity_type" ng-change="vm.loadLogs()">',
        '              <option value="">All Types</option>',
        '              <option value="competition">Competition</option>',
        '              <option value="category">Category</option>',
        '              <option value="round">Round</option>',
        '              <option value="nominee">Nominee</option>',
        '              <option value="submission">Submission</option>',
        '              <option value="user">User</option>',
        '              <option value="settings">Settings</option>',
        '              <option value="system">System</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Action</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.logs.filters.action" ng-change="vm.loadLogs()">',
        '              <option value="">All Actions</option>',
        '              <option value="PLATFORM_SETTINGS_UPDATED">Settings Updated</option>',
        '              <option value="PLATFORM_LOGO_UPDATED">Logo Updated</option>',
        '              <option value="PLATFORM_FAVICON_UPDATED">Favicon Updated</option>',
        '              <option value="SYSTEM_BACKUP_CREATED">Backup Created</option>',
        '              <option value="SMS_GATEWAY_TEST">SMS Gateway Test</option>',
        '              <option value="EMAIL_GATEWAY_TEST">Email Gateway Test</option>',
        '              <option value="USER_STATUS_CHANGED">User Status Changed</option>',
        '              <option value="VOTING_PAUSE_CHANGED">Voting Pause Changed</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="table-responsive" ng-if="!vm.logs.loading">',
        '        <table class="data-table">',
        '          <thead><tr><th>Timestamp</th><th>Action</th><th>Target Entity</th><th>Actor</th><th>Payload Details</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="a in vm.logs.items">',
        '              <td><span style="font-size:0.82rem;white-space:nowrap;">{{ a.created_at }}</span></td>',
        '              <td><code>{{ a.action }}</code></td>',
        '              <td>{{ a.entity_type }} <span class="muted" ng-if="a.entity_id">({{ a.entity_id }})</span></td>',
        '              <td>{{ a.actor ? a.actor.full_name : "System" }}</td>',
        '              <td><pre style="font-size:0.75rem;margin:0;max-width:320px;overflow:hidden;text-overflow:ellipsis;">{{ a.after_json || a.before_json || "-" }}</pre></td>',
        '            </tr>',
        '            <tr ng-if="!vm.logs.items.length">',
        '              <td colspan="5" class="dt-empty">No audit logs match the selected search criteria.</td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '      <div ng-if="vm.logs.loading" class="loading-box" style="padding:24px;text-align:center;">Loading audit trail...</div>',
        '    </div>',
        '',
        '    <!-- TAB 6: ANNOUNCEMENTS -->',
        '    <div ng-if="vm.activeTab === \'announcements\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Platform Announcements</h1>',
        '      <p class="muted mb-3" style="font-size:0.88rem;">Broadcast announcements shown on contestant and voter portals.</p>',
        '',
        '      <!-- Edit existing announcement form -->',
        '      <div class="card mb-3" ng-if="vm.editingAnn" style="background:var(--bg-subtle);border-left:4px solid var(--primary);padding:14px;">',
        '        <h3 style="margin-top:0;font-size:1.15rem;">Edit Announcement</h3>',
        '        <form ng-submit="vm.saveEditAnnouncement()">',
        '          <div class="grid-2">',
        '            <div class="form-group"><label class="form-label">Announcement Title *</label><input type="text" class="form-control" ng-model="vm.editingAnn.title" required /></div>',
        '            <div class="form-group"><label class="form-label">Date (YYYY-MM-DD)</label><input type="text" class="form-control" ng-model="vm.editingAnn.date" /></div>',
        '          </div>',
        '          <div class="form-group"><label class="form-label">Summary *</label><textarea class="form-control" ng-model="vm.editingAnn.summary" rows="3" required></textarea></div>',
        '          <div class="inline-actions">',
        '            <button type="submit" class="btn btn-primary btn-sm"><th-icon name="check" size="14"></th-icon><span>Save Changes</span></button>',
        '            <button type="button" class="btn btn-secondary btn-sm" ng-click="vm.cancelEditAnnouncement()">Cancel</button>',
        '          </div>',
        '        </form>',
        '      </div>',
        '',
        '      <!-- Add new announcement form -->',
        '      <form class="card mb-3" ng-submit="vm.addAnnouncement()" style="padding:14px;" ng-if="!vm.editingAnn">',
        '        <h3 style="margin-top:0;font-size:1.1rem;">Post New Announcement</h3>',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Announcement Title *</label><input type="text" class="form-control" ng-model="vm.newAnn.title" placeholder="Quarterfinal voting now open..." required /></div>',
        '          <div class="form-group"><label class="form-label">Date (YYYY-MM-DD)</label><input type="text" class="form-control" ng-model="vm.newAnn.date" placeholder="2026-11-17" /></div>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Summary *</label><textarea class="form-control" ng-model="vm.newAnn.summary" rows="2" placeholder="Key details and instructions..." required></textarea></div>',
        '        <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Publish Announcement</span></button>',
        '      </form>',
        '',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Published Announcements</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.filteredAnnouncements().length }} of {{ vm.announcements.length }}</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeAnnFilterCount() > 0" ng-click="vm.resetAnnFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Announcements</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.annFilters.q" placeholder="Search announcement title or summary..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Sort Order</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.annFilters.sort">',
        '              <option value="newest">Newest First</option>',
        '              <option value="oldest">Oldest First</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div ng-if="!vm.filteredAnnouncements().length" class="empty-state">No announcements match the search filter.</div>',
        '      <div ng-repeat="a in vm.filteredAnnouncements()" style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">',
        '        <div>',
        '          <strong style="font-size:1rem;">{{ a.title }}</strong> <span class="muted" style="font-size:0.82rem;">({{ a.date }})</span>',
        '          <p class="muted" style="margin:4px 0 0;font-size:0.9rem;">{{ a.summary }}</p>',
        '        </div>',
        '        <div class="inline-actions" style="flex-shrink:0;">',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.startEditAnnouncement(a)">Edit</button>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.deleteAnnouncement(a)" style="color:var(--danger,#e53e3e);">&#10005; Delete</button>',
        '        </div>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB 7: ADS & SPONSORSHIPS -->',
        '    <div ng-if="vm.activeTab === \'ads\'" class="mt-3">',
        '      <div class="flex-between mb-2">',
        '        <div>',
        '          <h2 style="margin:0;font-size:1.35rem;">Advertising &amp; Google Ads Banners</h2>',
        '          <p class="muted" style="margin:4px 0 0;font-size:0.88rem;">Manage Partner &amp; Supporter ad rotations and Google AdSense units across public pages.</p>',
        '        </div>',
        '        <span class="sp-tier-pill sp-tier-pill-sm sp-tier-title">&#9733; Ad Manager Active</span>',
        '      </div>',
        '',
        '      <form ng-submit="vm.saveAdSettings()">',
        '        <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Global Ad System</label>',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.adSettings.ads_enabled" /> Enable Ads on Pages',
        '            </label>',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Master switch for all banner units.</div>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Partner &amp; Supporter Ads</label>',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.adSettings.partner_ads_enabled" /> Rotate Partner Adverts',
        '            </label>',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Highlights active sponsors &amp; partners.</div>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Google Ads (AdSense)</label>',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.adSettings.google_ads_enabled" /> Serve Google Ads',
        '            </label>',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Serves responsive AdSense tags.</div>',
        '          </div>',
        '        </div>',
        '',
        '        <div class="grid-2 mb-3">',
        '          <div>',
        '            <label class="form-label">Banner Display Mode</label>',
        '            <select class="form-control" ng-model="vm.adSettings.ad_banner_style">',
        '              <option value="hybrid">Hybrid (Tabs / Auto-switch between Partners &amp; Google)</option>',
        '              <option value="partner_only">Partner &amp; Supporter Ads Only</option>',
        '              <option value="google_only">Google Ads Only</option>',
        '            </select>',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Partner Slide Rotation Speed (Seconds)</label>',
        '            <input type="number" class="form-control" ng-model="vm.adSettings.partner_ads_rotation_seconds" min="3" max="60" />',
        '          </div>',
        '        </div>',
        '',
        '        <h3 style="font-size:1.08rem;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border);">Google AdSense Account &amp; Slot Configuration</h3>',
        '        <div class="form-group mb-3">',
        '          <label class="form-label">Google AdSense Publisher Client ID</label>',
        '          <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_client_id" placeholder="ca-pub-6412959828302194" />',
        '          <div class="muted" style="font-size:0.8rem;margin-top:4px;">Found in your Google AdSense console under Account &rarr; Settings &rarr; Publisher ID.</div>',
        '        </div>',
        '',
        '        <div class="grid-3 mb-3">',
        '          <div class="form-group">',
        '            <label class="form-label">Homepage Leaderboard Slot</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.home_leaderboard" placeholder="4892019283" />',
        '          </div>',
        '          <div class="form-group">',
        '            <label class="form-label">Homepage Mid-Feed Slot</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.home_mid" placeholder="7193028491" />',
        '          </div>',
        '          <div class="form-group">',
        '            <label class="form-label">Nominees Directory Slot</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.nominees_top" placeholder="1003003003" />',
        '          </div>',
        '          <div class="form-group">',
        '            <label class="form-label">Nominee Profile Slot</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.nominee_profile" placeholder="1004004004" />',
        '          </div>',
        '          <div class="form-group">',
        '            <label class="form-label">Voting &amp; Checkout Slot</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.voting_page" placeholder="1005005005" />',
        '          </div>',
        '          <div class="form-group">',
        '            <label class="form-label">Results Page Slot</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.results_page" placeholder="1006006006" />',
        '          </div>',
        '        </div>',
        '',
        '        <div class="inline-actions">',
        '          <button type="submit" class="btn btn-primary" ng-disabled="vm.savingAds">',
        '            <th-icon name="check" size="15"></th-icon><span>{{ vm.savingAds ? "Saving..." : "Save Advertising Settings" }}</span>',
        '          </button>',
        '        </div>',
        '      </form>',
        '    </div>',
        '',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
