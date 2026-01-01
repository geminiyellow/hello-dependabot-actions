#!/usr/bin/env node

/**
 * Mock IMC (Identity Management Center) Service
 *
 * This is a simple mock service for development and testing.
 * In production, replace with your actual IMC service.
 *
 * Usage:
 *   node mock-imc-service.js
 *   # or
 *   npm install express
 *   node mock-imc-service.js
 */

const express = require('express');
const app = express();

app.use(express.json());

// Mock database
const TENANTS = {
  'tenant-acme': {
    id: 'tenant-acme',
    name: 'ACME Corporation',
    code: 'acme',
    isDefault: true
  },
  'tenant-tech': {
    id: 'tenant-tech',
    name: 'TechCorp Inc',
    code: 'tech',
    isDefault: false
  },
  'tenant-startup': {
    id: 'tenant-startup',
    name: 'Startup Labs',
    code: 'startup',
    isDefault: false
  }
};

const USER_TENANTS = {
  // Most users have access to 2+ tenants (triggers tenant selection)
  'default': ['tenant-acme', 'tenant-tech'],

  // Admin has access to all tenants
  'admin': ['tenant-acme', 'tenant-tech', 'tenant-startup'],

  // Single tenant user (directly gets JWT without selection)
  'single-user': ['tenant-acme']
};

/**
 * Get all tenants for a user
 * GET /api/users/:userId/tenants
 */
app.get('/api/users/:userId/tenants', (req, res) => {
  const userId = req.params.userId;
  console.log(`📋 [IMC] Fetching tenants for user: ${userId}`);

  // Get user's tenant IDs (default to 'default' if user not found)
  const tenantIds = USER_TENANTS[userId] || USER_TENANTS['default'];

  // Map to tenant objects
  const tenants = tenantIds.map(id => TENANTS[id]).filter(t => t);

  console.log(`   ✅ Found ${tenants.length} tenants for user ${userId}`);
  res.json(tenants);
});

/**
 * Get specific tenant information
 * GET /api/tenants/:tenantId
 */
app.get('/api/tenants/:tenantId', (req, res) => {
  const tenantId = req.params.tenantId;
  console.log(`🏢 [IMC] Fetching tenant: ${tenantId}`);

  const tenant = TENANTS[tenantId];

  if (!tenant) {
    console.log(`   ❌ Tenant not found: ${tenantId}`);
    return res.status(404).json({ error: 'Tenant not found' });
  }

  console.log(`   ✅ Tenant found: ${tenant.name}`);
  res.json(tenant);
});

/**
 * Health check
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'mock-imc' });
});

/**
 * Get all tenants (admin)
 * GET /api/tenants
 */
app.get('/api/tenants', (req, res) => {
  console.log('📋 [IMC] Fetching all tenants');
  res.json(Object.values(TENANTS));
});

/**
 * Create new tenant (for testing)
 * POST /api/tenants
 */
app.post('/api/tenants', (req, res) => {
  const { id, name, code, isDefault } = req.body;

  if (!id || !name || !code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  TENANTS[id] = { id, name, code, isDefault: isDefault || false };
  console.log(`✨ [IMC] Created tenant: ${name} (${id})`);

  res.status(201).json(TENANTS[id]);
});

/**
 * Assign user to tenant (for testing)
 * POST /api/users/:userId/tenants
 */
app.post('/api/users/:userId/tenants', (req, res) => {
  const userId = req.params.userId;
  const { tenantId } = req.body;

  if (!TENANTS[tenantId]) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  if (!USER_TENANTS[userId]) {
    USER_TENANTS[userId] = [];
  }

  if (!USER_TENANTS[userId].includes(tenantId)) {
    USER_TENANTS[userId].push(tenantId);
  }

  console.log(`🔗 [IMC] Assigned user ${userId} to tenant ${tenantId}`);
  res.json({ message: 'User assigned to tenant' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ [IMC] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚀 Mock IMC Service Started                              ║
╠════════════════════════════════════════════════════════════╣
║   URL: http://localhost:${PORT}                             ║
║   Health: http://localhost:${PORT}/health                   ║
╠════════════════════════════════════════════════════════════╣
║   📋 Mock Tenants:                                         ║
║   - ACME Corporation (tenant-acme)                        ║
║   - TechCorp Inc (tenant-tech)                            ║
║   - Startup Labs (tenant-startup)                         ║
╠════════════════════════════════════════════════════════════╣
║   👥 Mock Users:                                           ║
║   - default: ACME + TechCorp                              ║
║   - admin: All tenants                                    ║
║   - single-user: ACME only                                ║
╠════════════════════════════════════════════════════════════╣
║   🧪 Test:                                                 ║
║   curl http://localhost:${PORT}/api/users/admin/tenants     ║
╚════════════════════════════════════════════════════════════╝
  `);
});
