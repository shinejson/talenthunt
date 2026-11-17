(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminSettingsController', ['ApiService', 'ToastService', 'AdminFilterUtils', '$timeout',
      function (ApiService, ToastService, AdminFilterUtils, $timeout) {
        var vm = this;

        // --- TAB STATE ---
        vm.activeTab = 'basic_info';
        vm.tabs = [
          { id: 'basic_info', label: 'Basic Info', icon: 'settings' },
          { id: 'sms_config', label: 'SMS Config', icon: 'mail' },
          { id: 'email_config', label: 'Email Config', icon: 'mail' },
          { id: 'backup', label: 'Backup', icon: 'download' },
          { id: 'logs', label: 'Logs', icon: 'history' },
          { id: 'announcements', label: 'Announcements', icon: 'bell' },
          { id: 'ads', label: 'Ads', icon: 'radio' }
        ];

        vm.switchTab = function (tabId) {
          vm.activeTab = tabId;
        };

        // --- BASIC INFO (Logo, Favicon, Branding) ---
        vm.basicInfo = {
          platform_name: 'StageLight',
          logo_url: null,
          favicon_url: null,
          currency: 'GHS',
          timezone: 'Africa/Accra',
          contact_email: '',
          contact_phone: ''
        };
        vm.logoAsset = null;
        vm.faviconAsset = null;

        // --- SMS CONFIG ---
        vm.smsConfig = {
          provider: 'arkesel',
          api_key: '',
          sender_id: 'StageLight',
          test_phone: ''
        };

        // --- EMAIL CONFIG ---
        vm.emailConfig = {
          server: 'smtp.sendgrid.net',
          port: 587,
          use_tls: true,
          username: 'apikey',
          password: '',
          default_sender: 'StageLight Ghana <noreply@stagelight.com.gh>'
        };

        // --- BACKUP ---
        vm.backupConfig = {
          last_backup: null,
          auto_backup_enabled: false,
          schedule: 'weekly',
          storage_path: '/app/backend/uploads/backups'
        };

        // --- LOGS ---
        vm.logs = {
          loading: false,
          items: [],
          filters: { q: '', entity_type: '', action: '' },
          meta: {}
        };

        // --- ANNOUNCEMENTS ---
        vm.announcements = [];
        vm.newAnn = { title: '', date: '2026-11-17', summary: '' };
        vm.annFilters = { q: '', sort: 'newest' };

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

        // --- LOAD ALL ---
        function loadSettings() {
          ApiService.get('/admin/settings').then(function (res) {
            var data = res.data || {};
            
            // Basic Info
            if (data.basic_info) {
              angular.extend(vm.basicInfo, data.basic_info);
            }
            // Logo/Favicon Assets (if URLs exist, we could fetch them or just keep current asset state)
            
            // SMS & Email
            if (data.sms_config) angular.extend(vm.smsConfig, data.sms_config);
            if (data.email_config) angular.extend(vm.emailConfig, data.email_config);
            
            // Backup
            if (data.backup_config) angular.extend(vm.backupConfig, data.backup_config);
            
            // Announcements
            var ann = (data.announcements && data.announcements.items) || [];
            vm.announcements = ann;
            
            // Ads
            if (data.ad_settings) {
              angular.extend(vm.adSettings, data.ad_settings);
              if (data.ad_settings.google_ads_slots) {
                vm.adSettings.google_ads_slots = angular.extend({}, vm.adSettings.google_ads_slots, data.ad_settings.google_ads_slots);
              }
            }
          });
        }

        loadSettings();

        // --- SAVE LOGIC ---
        vm.saveBasicInfo = function () {
          ApiService.patch('/admin/settings', { basic_info: vm.basicInfo }).then(function () {
            ToastService.success('Basic Info saved.');
            // Refresh public branding
            loadPublicBranding();
          }, function (err) { ToastService.error(err.message || 'Failed to save.'); });
        };

        vm.uploadLogo = function (file) {
          if (!file) return;
          ApiService.upload('/admin/settings/logo', file).then(function (res) {
            vm.logoAsset = res.data;
            vm.basicInfo.logo_url = res.data.url;
            vm.saveBasicInfo();
            ToastService.success('Logo uploaded.');
          }, function (err) { ToastService.error(err.message || 'Upload failed.'); });
        };

        vm.uploadFavicon = function (file) {
          if (!file) return;
          ApiService.upload('/admin/settings/favicon', file).then(function (res) {
            vm.faviconAsset = res.data;
            vm.basicInfo.favicon_url = res.data.url;
            vm.saveBasicInfo();
            ToastService.success('Favicon uploaded.');
            // Update index.html link dynamically or via reload
            $timeout(function() {
              var link = document.querySelector("link[rel='icon']");
              if (link) link.href = res.data.url;
              else {
                var newLink = document.createElement('link');
                newLink.rel = 'icon';
                newLink.href = res.data.url;
                document.head.appendChild(newLink);
              }
            }, 100);
          }, function (err) { ToastService.error(err.message || 'Upload failed.'); });
        };

        vm.saveSmsConfig = function () {
          ApiService.patch('/admin/settings', { sms_config: vm.smsConfig }).then(function () {
            ToastService.success('SMS Config saved.');
          }, function (err) { ToastService.error(err.message || 'Failed to save.'); });
        };

        vm.sendSmsTest = function () {
          ApiService.post('/admin/settings/sms-test', vm.smsConfig).then(function () {
            ToastService.success('SMS test sent to ' + vm.smsConfig.test_phone);
          }, function (err) { ToastService.error(err.message || 'Failed.'); });
        };

        vm.saveEmailConfig = function () {
          ApiService.patch('/admin/settings', { email_config: vm.emailConfig }).then(function () {
            ToastService.success('Email Config saved.');
          }, function (err) { ToastService.error(err.message || 'Failed to save.'); });
        };

        vm.sendEmailTest = function () {
          ApiService.post('/admin/settings/email-test', vm.emailConfig).then(function () {
            ToastService.success('Email test sent.');
          }, function (err) { ToastService.error(err.message || 'Failed.'); });
        };

        vm.saveBackupConfig = function () {
          ApiService.patch('/admin/settings', { backup_config: vm.backupConfig }).then(function () {
            ToastService.success('Backup Config saved.');
          }, function (err) { ToastService.error(err.message || 'Failed.'); });
        };

        vm.triggerBackup = function () {
          ApiService.post('/admin/settings/backup-now', {}).then(function (res) {
            ToastService.success('Backup triggered: ' + res.data.message);
            vm.backupConfig.last_backup = res.data.timestamp;
          }, function (err) { ToastService.error(err.message || 'Failed.'); });
        };

        // --- LOGS TAB ---
        vm.loadLogs = function () {
          vm.logs.loading = true;
          ApiService.get('/admin/audit-logs', AdminFilterUtils.cleanParams(vm.logs.filters)).then(function (res) {
            vm.logs.items = res.data || [];
            vm.logs.meta = res.meta || {};
            vm.logs.loading = false;
          }, function (err) {
            ToastService.error(err.message || 'Failed to load logs.');
            vm.logs.loading = false;
          });
        };
        vm.loadLogs();

        vm.resetLogFilters = function () {
          vm.logs.filters = { q: '', entity_type: '', action: '' };
          vm.loadLogs();
        };

        // --- ANNOUNCEMENTS TAB ---
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
          vm.announcements.unshift({
            id: 'ann-' + Date.now(),
            title: vm.newAnn.title,
            date: vm.newAnn.date,
            summary: vm.newAnn.summary
          });
          ApiService.patch('/admin/settings', { announcements: { items: vm.announcements } }).then(function () {
            vm.newAnn = { title: '', date: '2026-11-17', summary: '' };
            ToastService.success('Announcement published.');
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

        // --- ADS TAB ---
        vm.saveAdSettings = function () {
          ApiService.patch('/admin/settings', { ad_settings: vm.adSettings }).then(function () {
            ToastService.success('Ad and sponsorship banner settings saved.');
          }, function (err) { ToastService.error(err.message || 'Failed to save ad settings.'); });
        };

        // --- PUBLIC BRANDING SYNC ---
        function loadPublicBranding() {
          // We can trigger a public info fetch or just rely on the frontend component updates
          // In this implementation, we'll assume the public components fetch /public/info
          $timeout(function() {
            // Optional: broadcast to navbar/footer if they listen
          }, 0);
        }

        // Initial fetch for public branding sync
        loadPublicBranding();
      }
    ])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/settings.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <div class="sp-admin-tabs">',
        '      <button ng-repeat="t in vm.tabs" class="sp-admin-tab" ng-class="{active: vm.activeTab === t.id}" ng-click="vm.switchTab(t.id)">',
        '        <th-icon name="{{ t.icon }}" size="14"></th-icon><span>{{ t.label }}</span>',
        '      </button>',
        '    </div>',

        '    <!-- TAB 1: BASIC INFO (Logo, Favicon, Branding) -->',
        '    <div ng-if="vm.activeTab === \'basic_info\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Basic Information &amp; Branding</h1>',
        '      <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Platform Name</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.platform_name" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Currency</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.currency" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Timezone</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.timezone" />',
        '        </div>',
        '      </div>',

        '      <div class="grid-2 mb-3">',
        '        <div>',
        '          <label class="form-label">Contact Email</label>',
        '          <input type="email" class="form-control" ng-model="vm.basicInfo.contact_email" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label">Contact Phone</label>',
        '          <input type="text" class="form-control" ng-model="vm.basicInfo.contact_phone" />',
        '        </div>',
        '      </div>',

        '      <div class="grid-2 mb-3">',
        '        <div>',
        '          <label class="form-label">Platform Logo (PNG, JPG, GIF)</label>',
        '          <th-upload-field asset="vm.logoAsset" on-uploaded="vm.uploadLogo($event.asset)"></th-upload-field>',
        '          <div class="mt-1" ng-if="vm.basicInfo.logo_url">',
        '            <img ng-src="{{ vm.basicInfo.logo_url }}" style="max-height:60px;margin-top:8px;" />',
        '          </div>',
        '        </div>',
        '        <div>',
        '          <label class="form-label">Favicon (PNG, JPG, GIF, ICO)</label>',
        '          <th-upload-field asset="vm.faviconAsset" on-uploaded="vm.uploadFavicon($event.asset)"></th-upload-field>',
        '          <div class="mt-1" ng-if="vm.basicInfo.favicon_url">',
        '            <img ng-src="{{ vm.basicInfo.favicon_url }}" style="max-height:32px;margin-top:8px;" />',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveBasicInfo()"><th-icon name="check" size="15"></th-icon><span>Save Basic Info</span></button>',
        '      </div>',
        '    </div>',

        '    <!-- TAB 2: SMS CONFIG -->',
        '    <div ng-if="vm.activeTab === \'sms_config\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">SMS Gateway Configuration</h1>',
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
        '          <label class="form-label" style="font-weight:700;">API Key</label>',
        '          <input type="password" class="form-control" ng-model="vm.smsConfig.api_key" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Sender ID</label>',
        '          <input type="text" class="form-control" ng-model="vm.smsConfig.sender_id" />',
        '        </div>',
        '      </div>',

        '      <div class="grid-2 mb-3">',
        '        <div>',
        '          <label class="form-label">Test Phone Number</label>',
        '          <input type="text" class="form-control" ng-model="vm.smsConfig.test_phone" placeholder="+233..." />',
        '        </div>',
        '        <div class="flex-between" style="align-items:flex-end;padding-top:18px;">',
        '          <div>',
        '            <button type="button" class="btn btn-primary" ng-click="vm.saveSmsConfig()"><th-icon name="check" size="15"></th-icon><span>Save SMS Config</span></button>',
        '          </div>',
        '          <div>',
        '            <button type="button" class="btn btn-secondary" ng-click="vm.sendSmsTest()"><th-icon name="mail" size="15"></th-icon><span>Send Test SMS</span></button>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <!-- TAB 3: EMAIL CONFIG -->',
        '    <div ng-if="vm.activeTab === \'email_config\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Transactional Email Configuration</h1>',
        '      <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">SMTP Server</label>',
        '          <input type="text" class="form-control" ng-model="vm.emailConfig.server" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Port</label>',
        '          <input type="number" class="form-control" ng-model="vm.emailConfig.port" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Use TLS</label>',
        '          <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '            <input type="checkbox" ng-model="vm.emailConfig.use_tls" /> Enable TLS Encryption',
        '          </label>',
        '        </div>',
        '      </div>',

        '      <div class="grid-3 mb-3">',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Username</label>',
        '          <input type="text" class="form-control" ng-model="vm.emailConfig.username" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Password</label>',
        '          <input type="password" class="form-control" ng-model="vm.emailConfig.password" />',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Default Sender</label>',
        '          <input type="text" class="form-control" ng-model="vm.emailConfig.default_sender" />',
        '        </div>',
        '      </div>',

        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveEmailConfig()"><th-icon name="check" size="15"></th-icon><span>Save Email Config</span></button>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.sendEmailTest()"><th-icon name="mail" size="15"></th-icon><span>Send Test Email</span></button>',
        '      </div>',
        '    </div>',

        '    <!-- TAB 4: BACKUP -->',
        '    <div ng-if="vm.activeTab === \'backup\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">System Backup &amp; Restore</h1>',
        '      <div class="card mb-3">',
        '        <div class="grid-2 mb-3">',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Auto Backup</label>',
        '            <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '              <input type="checkbox" ng-model="vm.backupConfig.auto_backup_enabled" /> Enable Scheduled Backups',
        '            </label>',
        '          </div>',
        '          <div>',
        '            <label class="form-label" style="font-weight:700;">Schedule</label>',
        '            <select class="form-control" ng-model="vm.backupConfig.schedule">',
        '              <option value="daily">Daily</option>',
        '              <option value="weekly">Weekly</option>',
        '              <option value="monthly">Monthly</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '        <div>',
        '          <label class="form-label" style="font-weight:700;">Storage Path</label>',
        '          <input type="text" class="form-control" ng-model="vm.backupConfig.storage_path" readonly />',
        '        </div>',
        '      </div>',

        '      <div class="inline-actions">',
        '        <button type="button" class="btn btn-primary" ng-click="vm.saveBackupConfig()"><th-icon name="check" size="15"></th-icon><span>Save Backup Config</span></button>',
        '        <button type="button" class="btn btn-secondary" ng-click="vm.triggerBackup()"><th-icon name="download" size="15"></th-icon><span>Trigger Manual Backup</span></button>',
        '      </div>',
        '      <div class="mt-2" ng-if="vm.backupConfig.last_backup">',
        '        <span class="muted">Last Backup: {{ vm.backupConfig.last_backup }}</span>',
        '      </div>',
        '    </div>',

        '    <!-- TAB 5: LOGS -->',
        '    <div ng-if="vm.activeTab === \'logs\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Audit &amp; System Logs</h1>',
        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="history" size="14"></th-icon><span>Filter Logs</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.logs.meta.total !== undefined ? vm.logs.meta.total : vm.logs.items.length }} log(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.logs.filters.q || vm.logs.filters.entity_type || vm.logs.filters.action" ng-click="vm.resetLogFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Logs</label>',
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
        '              <option value="application">Application</option>',
        '              <option value="user">User</option>',
        '              <option value="settings">Settings</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Action</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.logs.filters.action" ng-change="vm.loadLogs()">',
        '              <option value="">All Actions</option>',
        '              <option value="COMPETITION_CREATED">Competition Created</option>',
        '              <option value="PLATFORM_SETTINGS_UPDATED">Settings Updated</option>',
        '              <option value="USER_STATUS_CHANGED">User Status Changed</option>',
        '              <option value="REPORT_EXPORTED">Report Exported</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div class="table-responsive" ng-if="!vm.logs.loading">',
        '        <table class="data-table">',
        '          <thead><tr><th dt-sort="created_at">Time</th><th dt-sort="action">Action</th><th dt-sort="entity_type">Entity</th><th>Actor</th><th>Details</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="a in vm.logs.items">',
        '              <td>{{ a.created_at }}</td>',
        '              <td><code>{{ a.action }}</code></td>',
        '              <td>{{ a.entity_type }} ({{ a.entity_id || \'-\' }})</td>',
        '              <td>{{ a.actor ? a.actor.full_name : \'System\' }}</td>',
        '              <td><pre style="font-size:0.76rem;margin:0;">{{ a.after_json || a.before_json || \'-\' }}</pre></td>',
        '            </tr>',
        '            <tr ng-if="!vm.logs.items.length">',
        '              <td colspan="5" class="dt-empty">No audit logs match the selected filters.</td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '      <div ng-if="vm.logs.loading" class="loading-box">Loading logs...</div>',
        '    </div>',

        '    <!-- TAB 6: ANNOUNCEMENTS -->',
        '    <div ng-if="vm.activeTab === \'announcements\'" class="mt-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Platform Announcements</h1>',
        '      <form class="mb-3" ng-submit="vm.addAnnouncement()">',
        '        <div class="grid-2">',
        '          <div class="form-group"><label class="form-label">Announcement Title *</label><input type="text" class="form-control" ng-model="vm.newAnn.title" required /></div>',
        '          <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-control" ng-model="vm.newAnn.date" /></div>',
        '        </div>',
        '        <div class="form-group"><label class="form-label">Summary *</label><textarea class="form-control" ng-model="vm.newAnn.summary" required></textarea></div>',
        '        <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Publish Announcement</span></button>',
        '      </form>',

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
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.annFilters.q" placeholder="Search announcement title, summary, or date..." />',
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

        '      <div ng-if="!vm.filteredAnnouncements().length" class="empty-state">No announcements match your search filter.</div>',
        '      <div ng-repeat="a in vm.filteredAnnouncements()" style="padding:10px 0;border-bottom:1px solid var(--border);">',
        '        <strong>{{ a.title }}</strong> <span class="muted">({{ a.date }})</span><p class="muted" style="margin:4px 0 0;">{{ a.summary }}</p>',
        '      </div>',
        '    </div>',

        '    <!-- TAB 7: ADS -->',
        '    <div ng-if="vm.activeTab === \'ads\'" class="mt-3">',
        '      <div class="card mt-3">',
        '        <div class="flex-between mb-2">',
        '          <div>',
        '            <h2 style="margin:0;font-size:1.35rem;">Advertising &amp; Google Ads Banners</h2>',
        '            <p class="muted" style="margin:4px 0 0;font-size:0.88rem;">Manage Partner &amp; Supporter ad rotations and Google AdSense units across public pages.</p>',
        '          </div>',
        '          <span class="sp-tier-pill sp-tier-pill-sm sp-tier-title">&#9733; Ad Manager Active</span>',
        '        </div>',

        '        <form ng-submit="vm.saveAdSettings()">',
        '          <div class="grid-3 mb-3" style="background:var(--bg-subtle);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border);">',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Global Ad System</label>',
        '              <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '                <input type="checkbox" ng-model="vm.adSettings.ads_enabled" /> Enable Ads on Pages',
        '              </label>',
        '              <div class="muted" style="font-size:0.78rem;margin-top:4px;">Master switch for all banner units.</div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Partner &amp; Supporter Ads</label>',
        '              <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '                <input type="checkbox" ng-model="vm.adSettings.partner_ads_enabled" /> Rotate Partner Adverts',
        '              </label>',
        '              <div class="muted" style="font-size:0.78rem;margin-top:4px;">Highlights active sponsors &amp; partners.</div>',
        '            </div>',
        '            <div>',
        '              <label class="form-label" style="font-weight:700;">Google Ads (AdSense)</label>',
        '              <label style="display:flex;align-items:center;gap:8px;font-size:0.92rem;cursor:pointer;">',
        '                <input type="checkbox" ng-model="vm.adSettings.google_ads_enabled" /> Serve Google Ads',
        '              </label>',
        '              <div class="muted" style="font-size:0.78rem;margin-top:4px;">Serves responsive AdSense tags.</div>',
        '            </div>',
        '          </div>',

        '          <div class="grid-2 mb-3">',
        '            <div>',
        '              <label class="form-label">Banner Display Mode</label>',
        '              <select class="form-control" ng-model="vm.adSettings.ad_banner_style">',
        '                <option value="hybrid">Hybrid (Tabs / Auto-switch between Partners &amp; Google)</option>',
        '                <option value="partner_only">Partner &amp; Supporter Ads Only</option>',
        '                <option value="google_only">Google Ads Only</option>',
        '              </select>',
        '            </div>',
        '            <div>',
        '              <label class="form-label">Partner Slide Rotation Speed (Seconds)</label>',
        '              <input type="number" class="form-control" ng-model="vm.adSettings.partner_ads_rotation_seconds" min="3" max="60" />',
        '            </div>',
        '          </div>',

        '          <h3 style="font-size:1.08rem;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border);">Google AdSense Account &amp; Slot Configuration</h3>',
        '          <div class="form-group mb-3">',
        '            <label class="form-label">Google AdSense Publisher Client ID</label>',
        '            <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_client_id" placeholder="ca-pub-6412959828302194" />',
        '            <div class="muted" style="font-size:0.8rem;margin-top:4px;">Found in your Google AdSense console under Account &rarr; Settings &rarr; Publisher ID.</div>',
        '          </div>',

        '          <div class="grid-3 mb-3">',
        '            <div class="form-group">',
        '              <label class="form-label">Homepage Leaderboard Slot</label>',
        '              <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.home_leaderboard" placeholder="4892019283" />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Homepage Mid-Feed Slot</label>',
        '              <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.home_mid" placeholder="7193028491" />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Nominees Directory Slot</label>',
        '              <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.nominees_top" placeholder="1003003003" />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Nominee Profile Slot</label>',
        '              <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.nominee_profile" placeholder="1004004004" />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Voting &amp; Checkout Slot</label>',
        '              <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.voting_page" placeholder="1005005005" />',
        '            </div>',
        '            <div class="form-group">',
        '              <label class="form-label">Results Page Slot</label>',
        '              <input type="text" class="form-control" ng-model="vm.adSettings.google_ads_slots.results_page" placeholder="1006006006" />',
        '            </div>',
        '          </div>',

        '          <div class="inline-actions">',
        '            <button type="submit" class="btn btn-primary"><th-icon name="check" size="15"></th-icon><span>Save Advertising Settings</span></button>',
        '          </div>',
        '        </form>',
        '      </div>',
        '    </div>',

        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
