import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { binanceService } from './src/server/binance.ts';
import { signalEngine } from './src/server/signalEngine.ts';
import { SECTOR_DEFINITIONS, calculateSectorData } from './src/server/sectors.ts';
import { databaseManager } from './src/server/database.ts';
import { telegramService } from './src/server/telegram.ts';
import { MarketOverview } from './src/types/crypto.ts';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  console.log('[Server] Initializing Crypto Market Intelligence Engine...');

  // Periodic market scan worker
  const runMarketScan = async () => {
    try {
      await binanceService.fetchTickers();
      const signals = await signalEngine.evaluateAllCoins();
      databaseManager.saveSignals(signals);

      // Auto-dispatch Strong Setups (score >= 80) if configured
      for (const sig of signals) {
        if (sig.score >= 80) {
          await telegramService.dispatchSignalAlert(sig);
        }
      }
    } catch (err) {
      console.error('[MarketScanWorker] Error during scan:', err);
    }
  };

  // Initial scan in background
  runMarketScan();
  // Scan every 45 seconds
  setInterval(runMarketScan, 45000);

  // ==================== API ROUTES ====================

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 2. Market Overview Dashboard
  app.get('/api/market/overview', async (req, res) => {
    try {
      const coins = binanceService.getAllCoins();
      const btc = coins.find((c) => c.symbol === 'BTCUSDT');
      const eth = coins.find((c) => c.symbol === 'ETHUSDT');
      const signals = signalEngine.getActiveSignals();

      const bullishSignals = signals.filter((s) => s.direction === 'BULLISH');
      const bearishSignals = signals.filter((s) => s.direction === 'BEARISH');

      // Sort high momentum coins
      const highMomentumCoins = [...coins]
        .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
        .slice(0, 6);

      // Sort top volume coins
      const topVolumeCoins = [...coins]
        .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
        .slice(0, 6);

      // Build sector data
      const coinStatsMap = new Map<string, any>();
      for (const sig of signals) {
        coinStatsMap.set(sig.symbol, {
          momentum: sig.indicators.momentum,
          volumeChange: sig.indicators.volumeChange,
          direction: sig.direction,
          score: sig.score,
        });
      }

      const sectors = SECTOR_DEFINITIONS.map((s) => calculateSectorData(s, coinStatsMap));

      // Calculate total market trend
      let totalMarketTrend: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
      const btcChange = btc?.change24h || 0;
      if (btcChange > 1.5 && bullishSignals.length >= bearishSignals.length) {
        totalMarketTrend = 'Bullish';
      } else if (btcChange < -1.5 || bearishSignals.length > bullishSignals.length + 3) {
        totalMarketTrend = 'Bearish';
      }

      const overview: MarketOverview = {
        btcPrice: btc?.price || 0,
        btcChange24h: btc?.change24h || 0,
        ethPrice: eth?.price || 0,
        ethChange24h: eth?.change24h || 0,
        totalMarketTrend,
        bullishSignalCount: bullishSignals.length,
        bearishSignalCount: bearishSignals.length,
        highMomentumCoins,
        topVolumeCoins,
        latestSignals: signals.slice(0, 8),
        sectors,
        lastUpdated: binanceService.getStatus().lastTickerUpdate || Date.now(),
      };

      res.json(overview);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Monitored coins list
  app.get('/api/market/coins', (req, res) => {
    const coins = binanceService.getAllCoins();
    res.json(coins);
  });

  // 4. Coin Detail & Technical Analysis
  app.get('/api/market/coin/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const coin = binanceService.getCoin(symbol.toUpperCase());
      if (!coin) {
        return res.status(404).json({ error: 'Coin not found in monitored list' });
      }

      const interval = (req.query.interval as '15m' | '1h' | '4h') || '1h';
      const candles = await binanceService.fetchKlines(coin.symbol, interval, 60);
      const signal = signalEngine.getSignalBySymbol(coin.symbol);

      res.json({
        coin,
        interval,
        candles,
        signal: signal || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Signals list with filters
  app.get('/api/signals', (req, res) => {
    const { direction, minScore, timeframe } = req.query;
    let signals = signalEngine.getActiveSignals();

    if (direction && typeof direction === 'string') {
      signals = signals.filter((s) => s.direction === direction.toUpperCase());
    }

    if (minScore) {
      const min = parseInt(minScore as string, 10);
      if (!isNaN(min)) {
        signals = signals.filter((s) => s.score >= min);
      }
    }

    if (timeframe && typeof timeframe === 'string') {
      signals = signals.filter((s) => s.timeframe === timeframe.toUpperCase());
    }

    res.json(signals);
  });

  // 6. Sectors Analysis
  app.get('/api/sectors', (req, res) => {
    const signals = signalEngine.getActiveSignals();
    const coinStatsMap = new Map<string, any>();
    for (const sig of signals) {
      coinStatsMap.set(sig.symbol, {
        momentum: sig.indicators.momentum,
        volumeChange: sig.indicators.volumeChange,
        direction: sig.direction,
        score: sig.score,
      });
    }

    const sectors = SECTOR_DEFINITIONS.map((s) => calculateSectorData(s, coinStatsMap));
    res.json(sectors);
  });

  // 7. Watchlist
  app.get('/api/watchlist', (req, res) => {
    const userId = (req.query.userId as string) || 'default_user';
    const symbols = databaseManager.getWatchlist(userId);
    const coins = symbols
      .map((sym) => binanceService.getCoin(sym))
      .filter((c) => c !== undefined);

    const signals = signalEngine.getActiveSignals();
    const signalMap = new Map<string, any>();
    for (const sig of signals) {
      signalMap.set(sig.symbol, sig);
    }

    const items = coins.map((coin) => ({
      coin,
      signal: signalMap.get(coin!.symbol) || null,
    }));

    res.json(items);
  });

  app.post('/api/watchlist/toggle', (req, res) => {
    const { symbol, userId } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }
    const updated = databaseManager.toggleWatchlist(userId || 'default_user', symbol.toUpperCase());
    res.json({ watchlist: updated });
  });

  // 8. User Settings
  app.get('/api/settings', (req, res) => {
    const userId = (req.query.userId as string) || 'default_user';
    const settings = databaseManager.getSettings(userId);
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    const { userId, updates } = req.body;
    const updated = databaseManager.updateSettings(userId || 'default_user', updates || {});
    res.json(updated);
  });

  // 9. Backtest & Signal History
  app.get('/api/history', (req, res) => {
    const history = databaseManager.getBacktestHistory();
    res.json(history);
  });

  // 10. System Status & Monitoring
  app.get('/api/system/status', (req, res) => {
    const binanceStatus = binanceService.getStatus();
    const dbStatus = databaseManager.getStatus();
    const signals = signalEngine.getActiveSignals();

    const status = {
      exchangeConnected: binanceStatus.isConnected,
      databaseConnected: true,
      telegramBotConfigured: telegramService.isConfigured(),
      lastDataUpdate: binanceStatus.lastTickerUpdate,
      lastSignalGen: signalEngine.getLastEvaluationTime(),
      activeSignalsCount: {
        total: signals.length,
        bullish: signals.filter((s) => s.direction === 'BULLISH').length,
        bearish: signals.filter((s) => s.direction === 'BEARISH').length,
      },
      totalCoinsMonitored: binanceStatus.coinsCount,
      rateLimitWeight: binanceStatus.rateLimitWeight,
      errorLogs: binanceStatus.errorLogs,
      recentNotifications: databaseManager.getRecentNotifications(),
      dbStats: dbStatus,
    };

    res.json(status);
  });

  // 11. Admin Trigger Scan
  app.post('/api/admin/trigger-scan', async (req, res) => {
    try {
      await binanceService.fetchTickers();
      const signals = await signalEngine.evaluateAllCoins();
      databaseManager.saveSignals(signals);
      res.json({
        success: true,
        signalsCount: signals.length,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. Telegram Command Tester / Simulator
  app.post('/api/telegram/command', (req, res) => {
    const { command, chatId } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command string is required (e.g., /start)' });
    }

    const signals = signalEngine.getActiveSignals();
    const response = telegramService.handleCommand(command, chatId || 'demo_user', signals);
    res.json(response);
  });

  // 13. Test Alert Dispatch
  app.post('/api/telegram/test-alert', async (req, res) => {
    try {
      const { signalId, chatId } = req.body;
      let signal = signalEngine.getActiveSignals()[0];

      if (signalId) {
        const found = signalEngine.getActiveSignals().find((s) => s.id === signalId);
        if (found) signal = found;
      }

      if (!signal) {
        return res.status(400).json({ error: 'No active signals available to dispatch.' });
      }

      const result = await telegramService.dispatchSignalAlert(signal, chatId);
      res.json({
        ...result,
        formattedAlert: telegramService.formatSignalAlert(signal),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 14. Telegram Webhook Endpoint
  app.post('/api/telegram/webhook', (req, res) => {
    const update = req.body;
    if (update && update.message && update.message.text) {
      const text = update.message.text;
      const chatId = String(update.message.chat.id);
      const signals = signalEngine.getActiveSignals();
      const reply = telegramService.handleCommand(text, chatId, signals);
      // In production with token, reply would be sent via fetch to sendMessage
      return res.json({ status: 'received', command: text, reply });
    }
    res.json({ status: 'ignored' });
  });

  // ==================== VITE MIDDLEWARE ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Production-ready Crypto Intelligence server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
