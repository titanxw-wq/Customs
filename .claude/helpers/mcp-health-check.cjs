#!/usr/bin/env node
/**
 * Claude Flow V3 - MCP Health Check
 * Runs on SessionStart to verify MCP services are available
 *
 * Checks:
 * 1. MCP configuration (.mcp.json)
 * 2. Claude Flow daemon status
 * 3. Memory system status
 * 4. Swarm initialization
 * 5. MCP tools availability
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MCP_CONFIG_PATH = path.join(PROJECT_ROOT, '.mcp.json');
const CLAUDE_FLOW_DIR = path.join(PROJECT_ROOT, '.claude-flow');
const METRICS_DIR = path.join(CLAUDE_FLOW_DIR, 'metrics');
const HEALTH_REPORT_PATH = path.join(METRICS_DIR, 'mcp-health.json');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkMCPConfig() {
  try {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      return { status: 'error', message: '.mcp.json not found' };
    }
    const config = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));
    const servers = Object.keys(config.mcpServers || {});

    if (servers.length === 0) {
      return { status: 'warning', message: 'No MCP servers configured' };
    }

    const autoStartServers = servers.filter(s => config.mcpServers[s].autoStart);
    const enabledServers = servers.filter(s => !config.mcpServers[s].disabled);

    return {
      status: 'ok',
      servers: servers,
      autoStart: autoStartServers,
      enabled: enabledServers,
      message: `${enabledServers.length}/${servers.length} servers enabled, ${autoStartServers.length} auto-start`
    };
  } catch (e) {
    return { status: 'error', message: `Config parse error: ${e.message}` };
  }
}

function checkDaemonStatus() {
  try {
    const result = execSync('claude-flow daemon status 2>/dev/null || echo "stopped"', {
      encoding: 'utf8',
      timeout: 5000,
      cwd: PROJECT_ROOT
    });

    if (result.includes('Running') || result.includes('PID')) {
      const pidMatch = result.match(/PID:\s*(\d+)/);
      return {
        status: 'ok',
        pid: pidMatch ? pidMatch[1] : 'unknown',
        message: 'Daemon running'
      };
    }

    return { status: 'warning', message: 'Daemon not running' };
  } catch (e) {
    return { status: 'warning', message: 'Daemon status unknown' };
  }
}

function checkMemoryStatus() {
  try {
    const memoryDb = path.join(PROJECT_ROOT, '.swarm', 'memory.db');
    const claudeFlowData = path.join(CLAUDE_FLOW_DIR, 'data');

    const hasMemoryDb = fs.existsSync(memoryDb);
    const hasDataDir = fs.existsSync(claudeFlowData);

    if (hasMemoryDb || hasDataDir) {
      return { status: 'ok', message: 'Memory system initialized' };
    }

    return { status: 'warning', message: 'Memory not initialized (run: claude-flow memory init)' };
  } catch (e) {
    return { status: 'warning', message: 'Memory status unknown' };
  }
}

function checkSwarmStatus() {
  try {
    const swarmConfig = path.join(CLAUDE_FLOW_DIR, 'config.yaml');

    if (fs.existsSync(swarmConfig)) {
      const config = fs.readFileSync(swarmConfig, 'utf8');
      if (config.includes('topology:')) {
        return { status: 'ok', message: 'Swarm configured' };
      }
    }

    return { status: 'warning', message: 'Swarm not configured' };
  } catch (e) {
    return { status: 'warning', message: 'Swarm status unknown' };
  }
}

function checkNodeModules() {
  try {
    // Check if claude-flow command is available
    const result = execSync('claude-flow --version 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000
    });

    if (result.includes('claude-flow')) {
      const versionMatch = result.match(/v?([\d\.\w-]+)/);
      return {
        status: 'ok',
        version: versionMatch ? versionMatch[1] : 'unknown',
        message: `Claude Flow v${versionMatch ? versionMatch[1] : 'installed'}`
      };
    }

    return { status: 'error', message: 'Claude Flow not installed (run: npm install -g claude-flow)' };
  } catch (e) {
    return { status: 'error', message: 'Cannot check claude-flow installation' };
  }
}

function checkClaudeFlowConfig() {
  try {
    const settingsPath = path.join(PROJECT_ROOT, '.claude', 'settings.json');

    if (!fs.existsSync(settingsPath)) {
      return { status: 'warning', message: 'settings.json not found' };
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    const hasMCPPermissions = settings.permissions?.allow?.some(p =>
      p.includes('mcp__') || p.includes('claude-flow')
    );

    const hasEnvConfig = settings.env?.CLAUDE_FLOW_V3_ENABLED === 'true';

    return {
      status: 'ok',
      mcpPermissions: hasMCPPermissions,
      v3Enabled: hasEnvConfig,
      message: `Settings configured (MCP: ${hasMCPPermissions ? 'yes' : 'no'}, V3: ${hasEnvConfig ? 'yes' : 'no'})`
    };
  } catch (e) {
    return { status: 'warning', message: 'Cannot read settings' };
  }
}

function startDaemonIfNeeded() {
  try {
    const result = execSync('claude-flow daemon status 2>/dev/null || echo "stopped"', {
      encoding: 'utf8',
      timeout: 5000,
      cwd: PROJECT_ROOT
    });

    if (!result.includes('Running') && !result.includes('PID')) {
      log('  Starting Claude Flow daemon...', 'cyan');
      execSync('claude-flow daemon start 2>/dev/null', {
        encoding: 'utf8',
        timeout: 10000,
        cwd: PROJECT_ROOT
      });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

function generateHealthReport(results) {
  // Ensure metrics directory exists
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    project: PROJECT_ROOT,
    checks: results,
    summary: {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      warning: results.filter(r => r.status === 'warning').length,
      error: results.filter(r => r.status === 'error').length
    },
    status: results.some(r => r.status === 'error') ? 'error' :
            results.some(r => r.status === 'warning') ? 'warning' : 'ok'
  };

  fs.writeFileSync(HEALTH_REPORT_PATH, JSON.stringify(report, null, 2));
  return report;
}

function main() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
  log('       Claude Flow V3 - MCP Health Check', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'dim');

  const checks = [
    { name: 'MCP Configuration', check: checkMCPConfig },
    { name: 'Claude Flow Install', check: checkNodeModules },
    { name: 'Daemon Status', check: checkDaemonStatus },
    { name: 'Memory System', check: checkMemoryStatus },
    { name: 'Swarm Configuration', check: checkSwarmStatus },
    { name: 'Project Settings', check: checkClaudeFlowConfig }
  ];

  const results = [];

  for (const { name, check } of checks) {
    const result = check();
    results.push({ name, ...result });

    const icon = result.status === 'ok' ? '✓' :
                 result.status === 'warning' ? '⚠' : '✗';
    const color = result.status === 'ok' ? 'green' :
                  result.status === 'warning' ? 'yellow' : 'red';

    log(`  ${icon} ${name}: ${result.message}`, color);
  }

  // Try to start daemon if not running
  const daemonResult = results.find(r => r.name === 'Daemon Status');
  if (daemonResult && daemonResult.status === 'warning') {
    if (startDaemonIfNeeded()) {
      log('  ✓ Daemon started automatically', 'green');
    }
  }

  // Generate report
  const report = generateHealthReport(results);

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');

  if (report.status === 'ok') {
    log(`  ✓ All ${report.summary.total} checks passed - MCP services ready`, 'green');
  } else if (report.status === 'warning') {
    log(`  ⚠ ${report.summary.warning} warning(s) - MCP services partially ready`, 'yellow');
    log('  Run "claude-flow doctor" for detailed diagnostics', 'dim');
  } else {
    log(`  ✗ ${report.summary.error} error(s) - MCP services need attention`, 'red');
    log('  Run "claude-flow doctor --fix" for automatic fixes', 'dim');
  }

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'dim');

  // Exit with appropriate code
  process.exit(report.status === 'error' ? 1 : 0);
}

main();
