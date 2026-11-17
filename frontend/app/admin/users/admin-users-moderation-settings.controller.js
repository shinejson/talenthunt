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
        vm.filters = {
          q: '',
          role: '',
          status: '',
          is_verified: ''
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', role: '', status: '', is_verified: '' };
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
          { id: 'social_links', label: 'Social Media', icon: 'share-2' },
          { id: 'payment_gateway', label: 'Payment Gateway', icon: 'credit-card' },
          { id: 'sms_config', label: 'SMS Config', icon: 'mail' },
          { id: 'email_config', label: 'Email Config', icon: 'mail' },
          { id: 'backup', label: 'Backup', icon: 'download' },
          { id: 'logs', label: 'Logs', icon: 'history' },
          { id: 'announcements', label: 'Announcements', icon: 'bell' },
          { id: 'ads', label: 'Ads', icon: 'radio' }
        ];

        vm.switchTab = function (tabId) {
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
          paystack: false,
          hubtel: false,
          flutterwave: false
        };

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

        vm.testPaymentGateway = function () {
          vm.testingPaymentGateway = true;
          vm.testGatewayResult = null;
          ApiService.post('/admin/settings/payment-gateway-test', {
            provider: vm.paymentConfig.active_provider,
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
          ApiService.post('/admin/settings/sms-test', vm.smsConfig).then(function (res) {
            vm.sendingSmsTest = false;
            ToastService.success(res.data.message || ('Test SMS dispatched to ' + vm.smsConfig.test_phone));
          }, function (err) {
            vm.sendingSmsTest = false;
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
          ApiService.post('/admin/settings/email-test', vm.emailConfig).then(function (res) {
            vm.sendingEmailTest = false;
            ToastService.success(res.data.message || 'Test email dispatched.');
          }, function (err) {
            vm.sendingEmailTest = false;
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
        '    <div class="card mb-3" ng-if="vm.editingUser">',
        '      <h3>Manage RBAC Roles: {{ vm.editingUser.full_name }}</h3>',
        '      <div class="inline-actions mb-2">',
        '        <label ng-repeat="role in vm.availableRoles" style="margin-right:12px;"><input type="checkbox" ng-model="vm.roleChecks[role]" /> {{ role }}</label>',
        '      </div>',
        '      <div class="inline-actions"><button type="button" class="btn btn-sm btn-primary" ng-click="vm.saveRoles()">Save Roles</button><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.editingUser = null">Cancel</button></div>',
        '    </div>',
        '    <div class="card">',
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Users &amp; Role-Based Access Control</h1>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',
        '',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Accounts</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.users.length }} user(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Users</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Name, email, phone, location..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">RBAC Role</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.role" ng-change="vm.load(1)">',
        '              <option value="">All Roles</option>',
        '              <option ng-repeat="r in vm.availableRoles" value="{{ r }}">{{ r }}</option>',
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
        '      <div class="table-responsive">',
        '        <table class="data-table" th-datatable="vm.table" dt-row="u" dt-empty="No user accounts match the selected filters.">',
        '          <thead><tr><th dt-sort="full_name">Name</th><th dt-sort="email">Contact</th><th>Roles</th><th dt-sort="status">Status</th><th>Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr>',
        '              <td><strong>{{ u.full_name }}</strong><div class="muted" style="font-size:0.76rem;" ng-if="u.location">{{ u.location }}</div></td>',
        '              <td>{{ u.email || u.phone }}</td>',
        '              <td><code>{{ u.roles.join(", ") }}</code></td>',
        '              <td><th-status-badge status="u.status"></th-status-badge></td>',
        '              <td class="inline-actions">',
        '                <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.openRoleEditor(u)">Edit Roles</button>',
        '                <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleStatus(u)">{{ u.status === "ACTIVE" ? "Suspend" : "Activate" }}</button>',
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
        '    <!-- TAB: PAYMENT GATEWAY CONFIG -->',
        '    <div ng-if="vm.activeTab === \'payment_gateway\'" class="mt-3">',
        '      <div class="flex-between mb-2" style="flex-wrap:wrap;gap:10px;">',
        '        <div>',
        '          <h1 style="margin:0;font-size:1.5rem;display:flex;align-items:center;gap:8px;">',
        '            <th-icon name="credit-card" size="22"></th-icon>',
        '            <span>Payment Gateway &amp; Mobile Money Configuration</span>',
        '          </h1>',
        '          <p class="muted mb-0" style="margin:4px 0 0;font-size:0.88rem;">Configure telecom aggregators, Paystack Ghana, Hubtel, Flutterwave, and Sandbox processing for public voting and nominee packages.</p>',
        '        </div>',
        '        <div class="inline-actions">',
        '          <span class="badge" ng-class="{\'badge-success\': vm.paymentConfig.environment === \'live\', \'badge-warning\': vm.paymentConfig.environment === \'sandbox\'}">',
        '            <th-icon name="shield" size="12"></th-icon>',
        '            <span>Mode: {{ vm.paymentConfig.environment | uppercase }}</span>',
        '          </span>',
        '          <span class="badge badge-info">',
        '            <span>Active: {{ vm.paymentConfig.active_provider | uppercase }}</span>',
        '          </span>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Provider & Environment Selector Card -->',
        '      <div class="card mb-3" style="background:var(--bg-subtle);padding:16px;">',
        '        <div class="grid-3">',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Active Primary Gateway</label>',
        '            <select class="form-control" ng-model="vm.paymentConfig.active_provider">',
        '              <option value="mock">GhanaPay Sandbox / Mock (Simulated Payments)</option>',
        '              <option value="paystack">Paystack Ghana (MoMo &amp; Cards)</option>',
        '              <option value="hubtel">Hubtel Ghana (Direct MoMo Aggregator)</option>',
        '              <option value="flutterwave">Flutterwave Ghana</option>',
        '            </select>',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Determines which processor handles public vote checkouts.</div>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Processing Environment</label>',
        '            <select class="form-control" ng-model="vm.paymentConfig.environment">',
        '              <option value="sandbox">Sandbox / Test Mode</option>',
        '              <option value="live">Live / Production Collections</option>',
        '            </select>',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Always test in Sandbox first before switching to Live.</div>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Settlement Currency</label>',
        '            <input type="text" class="form-control" ng-model="vm.paymentConfig.currency" placeholder="GHS" />',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Default ISO currency code for voter transactions.</div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Payment Rules & Acceptance Limits -->',
        '      <div class="card mb-3">',
        '        <h3 style="margin:0 0 12px;font-size:1.05rem;display:flex;align-items:center;gap:6px;">',
        '          <th-icon name="sliders" size="16"></th-icon><span>Payment Rules &amp; Acceptance Channels</span>',
        '        </h3>',
        '        <div class="grid-4 mb-3">',
        '          <div>',
        '            <label class="form-label" style="font-weight:600;">Min. Purchase (GHS)</label>',
        '            <input type="number" step="0.5" class="form-control" ng-model="vm.paymentConfig.min_amount_ghs" />',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:600;">Daily Cap per Voter (GHS)</label>',
        '            <input type="number" step="100" class="form-control" ng-model="vm.paymentConfig.max_daily_spend_ghs" />',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:600;">Platform Fee (%)</label>',
        '            <input type="number" step="0.1" class="form-control" ng-model="vm.paymentConfig.platform_fee_percent" />',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:600;">Sandbox Auto-Settle</label>',
        '            <div style="margin-top:8px;">',
        '              <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '                <input type="checkbox" ng-model="vm.paymentConfig.auto_settle_mock" />',
        '                <span>Auto-settle test orders</span>',
        '              </label>',
        '            </div>',
        '          </div>',
        '        </div>',
        '        <div style="display:flex;flex-wrap:wrap;gap:20px;padding-top:10px;border-top:1px solid var(--border);">',
        '          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.paymentConfig.allow_mobile_money" />',
        '            <strong>Enable Mobile Money</strong> (MTN MoMo, Telecel Cash, AirtelTigo)',
        '          </label>',
        '          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.paymentConfig.allow_card" />',
        '            <strong>Enable Card Payments</strong> (Visa, Mastercard, Verve)',
        '          </label>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- 1. PAYSTACK GHANA -->',
        '      <div class="card mb-3" style="border-left: 4px solid #059669;" ng-class="{\'shadow-sm\': vm.paymentConfig.active_provider === \'paystack\'}">',
        '        <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.1rem;">',
        '              <th-icon name="credit-card" size="18"></th-icon>',
        '              <span>Paystack Ghana Integration</span>',
        '              <span class="badge badge-success" ng-if="vm.paymentConfig.active_provider === \'paystack\'">ACTIVE PROVIDER</span>',
        '            </h3>',
        '            <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Accepts MTN MoMo, Telecel Cash, and Bank Cards with instant webhook settlement.</p>',
        '          </div>',
        '          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.paymentConfig.paystack.enabled" />',
        '            <span>Enable Paystack</span>',
        '          </label>',
        '        </div>',
        '        <div class="grid-2 mb-3">',
        '          <div>',
        '            <label class="form-label">Paystack Public Key</label>',
        '            <input type="text" class="form-control" ng-model="vm.paymentConfig.paystack.public_key" placeholder="pk_test_... or pk_live_..." />',
        '            <div class="muted" style="font-size:0.76rem;margin-top:3px;">Client-side key used for secure checkout initialization.</div>',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Paystack Secret Key</label>',
        '            <input type="password" class="form-control" ng-model="vm.paymentConfig.paystack.secret_key" placeholder="sk_test_... or sk_live_..." />',
        '            <div class="muted" style="font-size:0.76rem;margin-top:3px;">Server-side secret key. Never shared publicly.</div>',
        '          </div>',
        '        </div>',
        '        <div class="grid-2 mb-3">',
        '          <div>',
        '            <label class="form-label">Webhook Secret / Signature Hash</label>',
        '            <input type="password" class="form-control" ng-model="vm.paymentConfig.paystack.webhook_secret" placeholder="Secret hash for HMAC verification" />',
        '            <div class="muted" style="font-size:0.76rem;margin-top:3px;">Used to verify genuine Paystack webhook events.</div>',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Paystack API Base URL</label>',
        '            <input type="text" class="form-control" ng-model="vm.paymentConfig.paystack.base_url" placeholder="https://api.paystack.co" />',
        '          </div>',
        '        </div>',
        '        <div class="card" style="background:var(--bg-subtle);padding:10px 14px;border:1px dashed var(--border);">',
        '          <div class="flex-between" style="flex-wrap:wrap;gap:8px;">',
        '            <div>',
        '              <strong style="font-size:0.82rem;text-transform:uppercase;color:var(--text-secondary);">Paystack Webhook URL:</strong>',
        '              <div style="font-family:monospace;font-size:0.86rem;margin-top:2px;">{{ vm.getWebhookUrl(\'paystack\') }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'paystack\'), \'Paystack Webhook URL\')">',
        '              <th-icon name="clipboard-check" size="13"></th-icon><span>Copy Webhook URL</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- 2. HUBTEL GHANA -->',
        '      <div class="card mb-3" style="border-left: 4px solid #d97706;" ng-class="{\'shadow-sm\': vm.paymentConfig.active_provider === \'hubtel\'}">',
        '        <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.1rem;">',
        '              <th-icon name="credit-card" size="18"></th-icon>',
        '              <span>Hubtel Ghana Direct MoMo Aggregator</span>',
        '              <span class="badge badge-warning" ng-if="vm.paymentConfig.active_provider === \'hubtel\'">ACTIVE PROVIDER</span>',
        '            </h3>',
        '            <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Direct telecom integration for Ghanaian Mobile Money networks.</p>',
        '          </div>',
        '          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.paymentConfig.hubtel.enabled" />',
        '            <span>Enable Hubtel</span>',
        '          </label>',
        '        </div>',
        '        <div class="grid-3 mb-3">',
        '          <div>',
        '            <label class="form-label">Client ID</label>',
        '            <input type="text" class="form-control" ng-model="vm.paymentConfig.hubtel.client_id" placeholder="Hubtel API Client ID" />',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Client Secret</label>',
        '            <input type="password" class="form-control" ng-model="vm.paymentConfig.hubtel.client_secret" placeholder="Hubtel Client Secret" />',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Merchant Account Number</label>',
        '            <input type="text" class="form-control" ng-model="vm.paymentConfig.hubtel.merchant_account_number" placeholder="201XXXX" />',
        '          </div>',
        '        </div>',
        '        <div class="card" style="background:var(--bg-subtle);padding:10px 14px;border:1px dashed var(--border);">',
        '          <div class="flex-between" style="flex-wrap:wrap;gap:8px;">',
        '            <div>',
        '              <strong style="font-size:0.82rem;text-transform:uppercase;color:var(--text-secondary);">Hubtel Webhook URL:</strong>',
        '              <div style="font-family:monospace;font-size:0.86rem;margin-top:2px;">{{ vm.getWebhookUrl(\'hubtel\') }}</div>',
        '            </div>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.copyToClipboard(vm.getWebhookUrl(\'hubtel\'), \'Hubtel Webhook URL\')">',
        '              <th-icon name="clipboard-check" size="13"></th-icon><span>Copy Webhook URL</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- 3. FLUTTERWAVE -->',
        '      <div class="card mb-3" style="border-left: 4px solid #f59e0b;" ng-class="{\'shadow-sm\': vm.paymentConfig.active_provider === \'flutterwave\'}">',
        '        <div class="flex-between mb-2" style="flex-wrap:wrap;gap:8px;">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.1rem;">',
        '              <th-icon name="credit-card" size="18"></th-icon>',
        '              <span>Flutterwave Integration</span>',
        '              <span class="badge badge-warning" ng-if="vm.paymentConfig.active_provider === \'flutterwave\'">ACTIVE PROVIDER</span>',
        '            </h3>',
        '            <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Pan-African and international cards &amp; wallets.</p>',
        '          </div>',
        '          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.88rem;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.paymentConfig.flutterwave.enabled" />',
        '            <span>Enable Flutterwave</span>',
        '          </label>',
        '        </div>',
        '        <div class="grid-3 mb-3">',
        '          <div>',
        '            <label class="form-label">Public Key</label>',
        '            <input type="text" class="form-control" ng-model="vm.paymentConfig.flutterwave.public_key" placeholder="FLWPUBK_TEST-..." />',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Secret Key</label>',
        '            <input type="password" class="form-control" ng-model="vm.paymentConfig.flutterwave.secret_key" placeholder="FLWSECK_TEST-..." />',
        '          </div>',
        '          <div>',
        '            <label class="form-label">Encryption Key / Webhook Hash</label>',
        '            <input type="password" class="form-control" ng-model="vm.paymentConfig.flutterwave.encryption_key" placeholder="Encryption key" />',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- 4. GHANAPAY SANDBOX / MOCK -->',
        '      <div class="card mb-3" style="border-left: 4px solid #6366f1;">',
        '        <div class="flex-between mb-2">',
        '          <div>',
        '            <h3 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.1rem;">',
        '              <th-icon name="shield" size="18"></th-icon>',
        '              <span>GhanaPay Sandbox Gateway</span>',
        '              <span class="badge badge-info" ng-if="vm.paymentConfig.active_provider === \'mock\'">ACTIVE SIMULATOR</span>',
        '            </h3>',
        '            <p class="muted mb-0" style="margin:2px 0 0;font-size:0.84rem;">Built-in local test simulator. Allows instant testing of voter payments, mobile money popups, and automated ledger settlements without external credentials.</p>',
        '          </div>',
        '          <span class="badge badge-success">Always Available</span>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Test Connection & Diagnostic Banner -->',
        '      <div class="card mb-3" ng-if="vm.testGatewayResult" style="padding:14px;border: 1px solid var(--border);" ng-style="vm.testGatewayResult.success ? {\'border-color\': \'var(--emerald)\', \'background\': \'rgba(5, 150, 105, 0.05)\'} : {\'border-color\': \'var(--danger)\', \'background\': \'rgba(220, 38, 38, 0.05)\'}">',
        '        <div style="display:flex;align-items:flex-start;gap:10px;">',
        '          <th-icon name="{{ vm.testGatewayResult.success ? \'check-circle\' : \'shield-alert\' }}" size="20" style="color: {{ vm.testGatewayResult.success ? \'var(--emerald)\' : \'var(--danger)\' }};flex-shrink:0;margin-top:2px;"></th-icon>',
        '          <div style="flex:1;">',
        '            <div style="display:flex;align-items:center;gap:8px;">',
        '              <strong>{{ vm.testGatewayResult.success ? "Gateway Connection Successful" : "Gateway Verification Notice" }}</strong>',
        '              <span class="badge" ng-class="{\'badge-success\': vm.testGatewayResult.success, \'badge-warning\': !vm.testGatewayResult.success}">{{ vm.testGatewayResult.provider | uppercase }}</span>',
        '            </div>',
        '            <p style="margin:4px 0 0;font-size:0.88rem;">{{ vm.testGatewayResult.message }}</p>',
        '            <div class="muted" style="font-size:0.76rem;margin-top:4px;">Verified at: {{ vm.testGatewayResult.timestamp | date:\'medium\' }}</div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <!-- Bottom Action Bar -->',
        '      <div class="inline-actions" style="gap:12px;">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.savePaymentConfig()" ng-disabled="vm.savingPayment">',
        '          <th-icon name="check" size="15"></th-icon><span>{{ vm.savingPayment ? "Saving Gateway Config..." : "Save Payment Gateway Config" }}</span>',
        '        </button>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.testPaymentGateway()" ng-disabled="vm.testingPaymentGateway">',
        '          <th-icon name="refresh" size="14"></th-icon><span>{{ vm.testingPaymentGateway ? "Testing Connection..." : "Test Gateway Connection" }}</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB 2: SMS CONFIG -->',
        '    <div ng-if="vm.activeTab === \'sms_config\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">SMS Gateway Configuration</h1>',
        '      <p class="muted mb-3" style="font-size:0.88rem;">Configure telecom SMS aggregators for vote receipt SMS and contestant notifications.</p>',
        '',
        '      <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Provider</label>',
        '          <select class="form-control" ng-model="vm.smsConfig.provider">',
        '            <option value="arkesel">Arkesel (Ghana)</option>',
        '            <option value="hubtel">Hubtel (Ghana)</option>',
        '            <option value="mnotify">MNotify (Ghana)</option>',
        '            <option value="twilio">Twilio (Global)</option>',
        '          </select>',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">API Key / Secret Token</label>',
        '          <input type="password" class="form-control" ng-model="vm.smsConfig.api_key" placeholder="Enter provider API key" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Registered Sender ID</label>',
        '          <input type="text" class="form-control" ng-model="vm.smsConfig.sender_id" placeholder="StageLight" />',
        '        </div>',
        '      </div>',
        '',
        '      <div class="card mb-3" style="background:var(--bg-subtle);padding:14px;">',
        '        <label class="form-label" style="font-weight:700;">Test SMS Dispatch</label>',
        '        <div class="grid-2">',
        '          <div>',
        '            <input type="text" class="form-control" ng-model="vm.smsConfig.test_phone" placeholder="Recipient Phone (e.g. +233241234567)" />',
        '            <div class="muted" style="font-size:0.78rem;margin-top:4px;">Include international format (+233 for Ghana).</div>',
        '          </div>',
        '          <div class="inline-actions">',
        '            <button type="button" class="btn btn-secondary" ng-click="vm.sendSmsTest()" ng-disabled="vm.sendingSmsTest">',
        '              <th-icon name="mail" size="15"></th-icon><span>{{ vm.sendingSmsTest ? "Sending Test..." : "Send Test SMS" }}</span>',
        '            </button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveSmsConfig()" ng-disabled="vm.savingSms">',
        '          <th-icon name="check" size="15"></th-icon><span>{{ vm.savingSms ? "Saving..." : "Save SMS Config" }}</span>',
        '        </button>',
        '      </div>',
        '    </div>',
        '',
        '    <!-- TAB 3: EMAIL CONFIG -->',
        '    <div ng-if="vm.activeTab === \'email_config\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Transactional Email Configuration</h1>',
        '      <p class="muted mb-3" style="font-size:0.88rem;">Configure SMTP server details for user onboarding, nomination notices, and payout statements.</p>',
        '',
        '      <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">SMTP Server Host</label>',
        '          <input type="text" class="form-control" ng-model="vm.emailConfig.server" placeholder="smtp.sendgrid.net" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">SMTP Port</label>',
        '          <input type="number" class="form-control" ng-model="vm.emailConfig.port" placeholder="587" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Security Protocol</label>',
        '          <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;margin-top:8px;">',
        '            <input type="checkbox" ng-model="vm.emailConfig.use_tls" /> Use TLS Encryption',
        '          </label>',
        '        </div>',
        '      </div>',
        '',
        '      <div class="grid-3 mb-3">',
        '        <div>',
        '          <label class="form-label">SMTP Username</label>',
        '          <input type="text" class="form-control" ng-model="vm.emailConfig.username" placeholder="apikey or user@host.com" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label">SMTP Password</label>',
        '          <input type="password" class="form-control" ng-model="vm.emailConfig.password" placeholder="Enter password or token" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label">Default Sender Address</label>',
        '          <input type="text" class="form-control" ng-model="vm.emailConfig.default_sender" placeholder="StageLight Ghana <noreply@stagelight.com.gh>" />',
        '        </div>',
        '      </div>',
        '',
        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveEmailConfig()" ng-disabled="vm.savingEmail">',
        '          <th-icon name="check" size="15"></th-icon><span>{{ vm.savingEmail ? "Saving..." : "Save Email Config" }}</span>',
        '        </button>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.sendEmailTest()" ng-disabled="vm.sendingEmailTest">',
        '          <th-icon name="mail" size="15"></th-icon><span>{{ vm.sendingEmailTest ? "Sending Test..." : "Send Test Email" }}</span>',
        '        </button>',
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
