document.addEventListener('DOMContentLoaded', () => {
    // 状態管理
    let cookies = 0;
    let jewels = 0;
    let totalCps = 0;
    let totalBaked = 0;
    let playerLevel = 1;
    let bonusesEarned = 0;
    let gameStartDate = new Date().toLocaleString();
    let maxCombo = 0;
    let currentCombo = 0;
    let lastClickTime = 0;
    let discoveredSweets = {
        normal: 0,
        jewel: 0,
        super: 0,
        rainbow: 0
    };
    let sweetCompendiumRewardClaimed = false;
    let sweetCompendiumSpawnBonus = 0;
    
    // フィーバー関連
    let isFeverActive = false;
    let feverMultiplier = 7;
    let currentFeverMultiplier = 1;
    let feverTimeLeft = 0;
    const FEVER_DURATION = 20; // 20秒
    const ADS_CONFIG = {
        android: {
            appId: 'ca-app-pub-9138341481603997~2199897351',
            rewardedAdUnitId: 'ca-app-pub-9138341481603997/1649233015'
        },
        ios: {
            appId: 'ca-app-pub-9138341481603997~9411113474',
            rewardedAdUnitId: 'ca-app-pub-9138341481603997/3187665067'
        }
    };
    const CURRENT_APP_VERSION = '1.0.0';
    const LATEST_APP_VERSION = '1.0.1';
    const UPDATE_STORE_URL = 'https://apps.apple.com/';
    let rewardedAdBusy = false;
    let admobInitialized = false;

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getAdPlatform() {
        if (window.Capacitor?.getPlatform) {
            const platform = window.Capacitor.getPlatform();
            if (platform === 'ios' || platform === 'android') return platform;
        }

        const ua = navigator.userAgent || '';
        if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
        if (/android/i.test(ua)) return 'android';
        return 'android';
    }

    async function triggerHaptic(style = 'light') {
        try {
            const haptics = window.Capacitor?.Plugins?.Haptics;
            if (haptics?.impact) {
                await haptics.impact({ style });
                return;
            }
        } catch (error) {
        }

        if (navigator.vibrate) {
            if (style === 'heavy') navigator.vibrate(18);
            else if (style === 'medium') navigator.vibrate(12);
            else navigator.vibrate(8);
        }
    }

    function compareVersions(current, latest) {
        const currentParts = current.split('.').map(part => parseInt(part, 10) || 0);
        const latestParts = latest.split('.').map(part => parseInt(part, 10) || 0);
        const maxLength = Math.max(currentParts.length, latestParts.length);

        for (let i = 0; i < maxLength; i++) {
            const currentValue = currentParts[i] || 0;
            const latestValue = latestParts[i] || 0;
            if (latestValue > currentValue) return -1;
            if (latestValue < currentValue) return 1;
        }

        return 0;
    }

    function shouldShowUpdateDialog() {
        return compareVersions(CURRENT_APP_VERSION, LATEST_APP_VERSION) === -1;
    }

    async function showBrandSplash() {
        if (!brandSplash || !brandLogo) return;

        await wait(50);
        brandLogo.classList.add('fade-in');
        await wait(500);
        await wait(500);
        brandLogo.classList.remove('fade-in');
        await wait(500);

        let tapText = brandSplash.querySelector('.brand-splash-tap');
        if (!tapText) {
            tapText = document.createElement('p');
            tapText.textContent = 'タップしてスタート';
            tapText.className = 'brand-splash-tap';
            brandSplash.appendChild(tapText);
        }

        brandSplash.style.pointerEvents = 'auto';

        await new Promise(resolve => {
            const onTap = (e) => {
                e.preventDefault();
                e.stopPropagation();
                brandSplash.removeEventListener('click', onTap, true);
                brandSplash.removeEventListener('touchend', onTap, true);
                resolve();
            };
            brandSplash.addEventListener('click', onTap, true);
            brandSplash.addEventListener('touchend', onTap, true);
        });

        brandSplash.style.pointerEvents = 'none';
        brandSplash.classList.add('fade-out');
        await wait(500);
        brandSplash.remove();
    }

    async function showUpdateDialogIfNeeded() {
        if (!updateModal || !shouldShowUpdateDialog()) return;

        currentVersionLabel.textContent = `現在: ${CURRENT_APP_VERSION}`;
        latestVersionLabel.textContent = `最新: ${LATEST_APP_VERSION}`;
        updateMessage.textContent = '新しいバージョンがあります。今すぐ更新すると最新機能が使えます。';
        updateModal.classList.remove('hidden');

        await new Promise(resolve => {
            const handleLater = () => {
                cleanup();
                updateModal.classList.add('hidden');
                resolve();
            };
            const handleUpdate = () => {
                cleanup();
                window.open(UPDATE_STORE_URL, '_blank');
                updateModal.classList.add('hidden');
                resolve();
            };
            const cleanup = () => {
                updateLaterBtn.removeEventListener('click', handleLater);
                updateNowBtn.removeEventListener('click', handleUpdate);
            };

            updateLaterBtn.addEventListener('click', handleLater);
            updateNowBtn.addEventListener('click', handleUpdate);
        });
    }

    async function runStartupSequence() {
        loadGame();
        calculateCps();
        updateDisplay();

        // App Tracking Transparency (iOS) と AdMob の初期化を早期に行う
        // Appleの審査ガイドライン 2.1 に対応
        if (window.Capacitor?.getPlatform?.() === 'ios') {
            await initializeAdMobPlugin();
        }

        await showBrandSplash();
        await showUpdateDialogIfNeeded();
        checkOfflineBonus();
        checkDailyBonus();
        updateDisplay();
    }

    function syncAppHeight() {
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${viewportHeight * 0.01}px`);
    }

    function getViewportCenter() {
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return {
            x: viewportWidth / 2,
            y: viewportHeight / 2
        };
    }

    function getRareSweetTextPosition() {
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return {
            x: viewportWidth / 2,
            y: viewportHeight * 0.68
        };
    }

    function clampEffectPosition(x, y) {
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return {
            x: Math.max(24, Math.min(viewportWidth - 24, x)),
            y: Math.max(48, Math.min(viewportHeight - 48, y))
        };
    }

    syncAppHeight();
    window.addEventListener('resize', syncAppHeight);
    window.addEventListener('orientationchange', syncAppHeight);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncAppHeight);
    }

    let upgrades = {
        'buy-cursor': { count: 0, cost: 15, baseCost: 15, cps: 0.1 },
        'buy-grandma': { count: 0, cost: 100, baseCost: 100, cps: 1.0 },
        'buy-factory': { count: 0, cost: 1100, baseCost: 1100, cps: 8.0 },
        'buy-donut': { count: 0, cost: 12000, baseCost: 12000, cps: 47 },
        'buy-icecream': { count: 0, cost: 130000, baseCost: 130000, cps: 260 },
        'buy-mine': { count: 0, cost: 1400000, baseCost: 1400000, cps: 1400 },
        'buy-fountain': { count: 0, cost: 20000000, baseCost: 20000000, cps: 7800 },
        'buy-bakery': { count: 0, cost: 330000000, baseCost: 330000000, cps: 44000 },
        'buy-planet': { count: 0, cost: 5100000000, baseCost: 5100000000, cps: 260000 }
    };

    // ボーナス・広告関連
    let adBoostActive = false;
    let boostEndTime = 0;
    let lastSaveTime = Date.now();
    let lastLoginDate = "";
    let pendingOfflineCookies = 0;
    let soundEnabled = true;
    let autoClickerEnabled = true;
    let autoClickerSoundEnabled = false;
    let autoClickerHapticsEnabled = false;
    let cooldowns = {
        'fever': 0,
        'jewel': 0,
        'boost': 0
    };
    const COOLDOWN_DURATIONS = {
        'fever': 120, // 2分
        'jewel': 300, // 5分
        'boost': 600  // 10分
    };

    // DOM要素の取得
    const cookieBtn = document.getElementById('cookie-btn');
    const cookieCountDisplay = document.getElementById('cookie-count');
    const jewelCountDisplay = document.getElementById('jewel-count');
    const cpsDisplay = document.getElementById('cps');
    const playerLevelText = document.getElementById('player-level-text');
    const playerLevelBox = document.getElementById('player-level-box');
    const playerLevelProgress = document.getElementById('player-level-progress');
    const autoclickerStatus = document.getElementById('autoclicker-status');
    const playArea = document.getElementById('play-area');
    
    // パネル操作用
    const buildingsPanel = document.getElementById('buildings-panel');
    const upgradesPanel = document.getElementById('upgrades-panel');
    const bonusPanel = document.getElementById('bonus-panel');
    const statsPanel = document.getElementById('stats-panel');
    const navTabs = document.querySelectorAll('.nav-tab');
    const closePanelBtns = document.querySelectorAll('.close-panel');
    const buildingBadge = document.getElementById('building-badge');
    const upgradeBadge = document.getElementById('upgrade-badge');
    const bonusBadge = document.getElementById('bonus-badge');

    // 広告用DOM
    const adOverlay = document.getElementById('ad-simulation-overlay');
    const adTimerCount = document.getElementById('ad-timer-count');
    const adProgress = document.getElementById('ad-progress');

    // オフラインモーダル用DOM
    const offlineModal = document.getElementById('offline-modal');
    const offlineCookiesDisplay = document.getElementById('offline-cookies-amount');
    const claimOfflineBtn = document.getElementById('claim-offline-btn');
    const adDoubleOfflineBtn = document.getElementById('ad-double-offline-btn');

    // デイリーボーナス用DOM
    const dailyModal = document.getElementById('daily-modal');
    const dailyCookiesReward = document.getElementById('daily-cookies-reward');
    const claimDailyBtn = document.getElementById('claim-daily-btn');
    const adTripleDailyBtn = document.getElementById('ad-triple-daily-btn');

    // 設定パネル用DOM
    const settingsPanel = document.getElementById('settings-panel');
    const settingsBtn = document.getElementById('settings-btn');
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const autoSoundToggleBtn = document.getElementById('auto-sound-toggle-btn');
    const autoHapticsToggleBtn = document.getElementById('auto-haptics-toggle-btn');
    const resetBtnMain = document.getElementById('reset-btn-main');

    // 課金モーダル用DOM
    const billingModal = document.getElementById('billing-modal');
    const billingProductName = document.getElementById('billing-product-name');
    const billingProductPrice = document.getElementById('billing-product-price');
    const billingCancelBtn = document.getElementById('billing-cancel-btn');
    const billingConfirmBtn = document.getElementById('billing-confirm-btn');
    let pendingBillingAmount = 0;

    // コンボ表示用DOM
    const comboDisplay = document.getElementById('combo-display');
    const brandSplash = document.getElementById('brand-splash');
    const brandLogo = document.getElementById('brand-logo');
    const updateModal = document.getElementById('update-modal');
    const updateMessage = document.getElementById('update-message');
    const currentVersionLabel = document.getElementById('current-version-label');
    const latestVersionLabel = document.getElementById('latest-version-label');
    const updateLaterBtn = document.getElementById('update-later-btn');
    const updateNowBtn = document.getElementById('update-now-btn');

    // アップグレード状態管理
    let passiveBuffs = {
        'upgrade-click': { purchased: false, level: 1, cost: 500, type: 'click', multiplier: 2 },
        'upgrade-grandma': { purchased: false, level: 1, cost: 1000, type: 'building', target: 'buy-grandma', multiplier: 2 },
        'upgrade-factory': { purchased: false, level: 1, cost: 10000, type: 'building', target: 'buy-factory', multiplier: 2 },
        'upgrade-fever': { purchased: false, level: 1, cost: 50000, type: 'fever', extend: 10 },
        'upgrade-global': { purchased: false, level: 1, cost: 100000, type: 'global', multiplier: 1.2 }
    };

    // プレミアム強化状態管理
    let premiumUpgrades = {
        'premium-fever': { purchased: false, level: 0, baseCost: 50, type: 'multiplier', value: 10 },
        'premium-spawn': { purchased: false, level: 0, baseCost: 75, type: 'spawn', rate: 2 },
        'premium-autoclick': { purchased: false, level: 0, baseCost: 100, type: 'autoclick', speed: 1000 },
        'premium-offline': { purchased: false, level: 0, baseCost: 30, type: 'offline', efficiency: 0.25 }
    };

    // フィーバー用DOM
    const feverTimerContainer = document.getElementById('fever-timer-container');
    const feverProgress = document.getElementById('fever-progress');
    const goldenSweetContainer = document.getElementById('golden-sweet-container');

    // 統計表示用
    const statBonuses = document.getElementById('stat-bonuses');
    const statStartDate = document.getElementById('stat-start-date');
    const statTotalBaked = document.getElementById('stat-total-baked');
    const statTotalBuildings = document.getElementById('stat-total-buildings');
    const statCookiesPerClick = document.getElementById('stat-cookies-per-click');
    const statMaxCombo = document.getElementById('stat-max-combo');
    const sweetEntries = document.querySelectorAll('.sweet-entry');
    const sweetCompleteBanner = document.getElementById('sweet-complete-banner');
    const sweetRewardBox = document.getElementById('sweet-encyclopedia-reward');
    const sweetRewardStatus = document.getElementById('sweet-reward-status');
    const sweetRewardDesc = document.getElementById('sweet-reward-desc');

    // タブクリックでパネル表示
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');
            if (target === 'buildings') {
                buildingsPanel.classList.remove('hidden');
                statsPanel.classList.add('hidden');
                bonusPanel.classList.add('hidden');
                upgradesPanel.classList.add('hidden');
                settingsPanel.classList.add('hidden');
            } else if (target === 'upgrades-panel') {
                upgradesPanel.classList.remove('hidden');
                buildingsPanel.classList.add('hidden');
                statsPanel.classList.add('hidden');
                bonusPanel.classList.add('hidden');
                settingsPanel.classList.add('hidden');
                updateDisplay(); 
            } else if (target === 'bonus-panel') {
                bonusPanel.classList.remove('hidden');
                buildingsPanel.classList.add('hidden');
                statsPanel.classList.add('hidden');
                upgradesPanel.classList.add('hidden');
                settingsPanel.classList.add('hidden');
                updateDisplay();
            } else if (target === 'stats-panel') {
                statsPanel.classList.remove('hidden');
                buildingsPanel.classList.add('hidden');
                upgradesPanel.classList.add('hidden');
                bonusPanel.classList.add('hidden');
                settingsPanel.classList.add('hidden');
                updateDisplay(); 
            }
        });
    });

    closePanelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            buildingsPanel.classList.add('hidden');
            upgradesPanel.classList.add('hidden');
            bonusPanel.classList.add('hidden');
            statsPanel.classList.add('hidden');
            settingsPanel.classList.add('hidden');
        });
    });

    // フィーバータイムの開始
    function startFeverTime(customMult = null, customDuration = 0) {
        const mult = customMult || (premiumUpgrades['premium-fever'].purchased ? premiumUpgrades['premium-fever'].value : feverMultiplier);
        
        // 基本20秒 + 強化ボーナス(10秒 + Lvごとに2秒追加)
        const baseDuration = customDuration || (FEVER_DURATION + (passiveBuffs['upgrade-fever'].purchased ? (10 + (passiveBuffs['upgrade-fever'].level - 1) * 2) : 0));
        const totalDuration = baseDuration;

        if (isFeverActive) {
            feverTimeLeft = Math.max(feverTimeLeft, totalDuration);
            currentFeverMultiplier = Math.max(currentFeverMultiplier, mult);
            if (currentFeverMultiplier >= 20) {
                playArea.classList.add('super-fever');
            }
            feverTimerContainer.querySelector('.fever-label').textContent = `Fever Time! x${currentFeverMultiplier}`;
            return;
        }

        isFeverActive = true;
        currentFeverMultiplier = mult;
        feverTimeLeft = totalDuration;
        bonusesEarned++;
        
        playArea.classList.add('fever-mode');
        if (mult >= 20) playArea.classList.add('super-fever'); // 高倍率時の視覚演出用
        
        feverTimerContainer.classList.remove('hidden');
        feverTimerContainer.querySelector('.fever-label').textContent = `Fever Time! x${mult}`;
        
        // フィーバー開始音 (少し高めの音)
        playSpecialSound(880, 0.3);

        const feverInterval = setInterval(() => {
            feverTimeLeft -= 0.1;
            const progress = (feverTimeLeft / totalDuration) * 100;
            feverProgress.style.width = `${progress}%`;

            if (feverTimeLeft <= 0) {
                clearInterval(feverInterval);
                endFeverTime();
            }
        }, 100);
        
        updateDisplay();
    }

    function endFeverTime() {
        isFeverActive = false;
        currentFeverMultiplier = 1;
        feverTimeLeft = 0;
        playArea.classList.remove('fever-mode');
        playArea.classList.remove('super-fever');
        feverTimerContainer.classList.add('hidden');
        updateDisplay();
    }

    // ゴールデンお菓子の出現
    function spawnGoldenSweet(forcedType = null) {
        if (goldenSweetContainer.children.length >= 3) return;
        
        const sweet = document.createElement('div');
        sweet.id = 'golden-sweet';
        const sweetLabel = document.createElement('span');
        sweetLabel.className = 'golden-sweet-label';
        
        // 種類の決定
        let type = forcedType;
        if (!type) {
            const rand = Math.random();
            type = 'normal';
            if (rand < 0.01) type = 'rainbow';      // 1%
            else if (rand < 0.07) type = 'super';   // 6%
            else if (rand < 0.25) type = 'jewel';   // 18%
            else type = 'normal';                   // 75%
        }

        let emoji = '🌟';
        let label = 'FEVER';
        if (type === 'jewel') emoji = '💎';
        if (type === 'super') emoji = '🔥';
        if (type === 'rainbow') emoji = '🌈';
        if (type === 'jewel') label = 'JEWEL';
        if (type === 'super') label = 'x25';
        if (type === 'rainbow') label = 'BONUS';
        
        sweet.textContent = emoji;
        sweet.className = `sweet-${type}`;
        sweetLabel.textContent = label;
        sweet.appendChild(sweetLabel);
        playSweetSpawnSound(type);
        
        const x = 10 + Math.random() * 80;
        const y = 20 + Math.random() * 60;
        sweet.style.left = `${x}%`;
        sweet.style.top = `${y}%`;

        sweet.addEventListener('click', (e) => {
            const rareSweetTextPosition = getRareSweetTextPosition();
            unlockSweetDiscovery(type, rareSweetTextPosition.x, rareSweetTextPosition.y);
            playSweetCollectSound(type);
            
            if (type === 'normal') {
                // 通常: フィーバー + 低確率ジュエル
                startFeverTime();
                if (Math.random() < 0.1) {
                    jewels += 1;
                    spawnFloatText(rareSweetTextPosition.x, rareSweetTextPosition.y, 'FEVER! x7\n+💎1', 'float-text-sweet');
                } else {
                    spawnFloatText(rareSweetTextPosition.x, rareSweetTextPosition.y, 'FEVER! x7', 'float-text-sweet');
                }
            } else if (type === 'jewel') {
                // ジュエル: 確定獲得 + 短いフィーバー
                const gain = Math.floor(Math.random() * 3) + 2; // 2-4個
                jewels += gain;
                startFeverTime(null, 5); // 通常倍率で5秒
                spawnFloatText(rareSweetTextPosition.x, rareSweetTextPosition.y, `ジュエルボーナス！\n+💎${gain}`, 'float-text-sweet');
            } else if (type === 'super') {
                // スーパー: 25倍フィーバー 10秒
                startFeverTime(25, 10);
                spawnFloatText(rareSweetTextPosition.x, rareSweetTextPosition.y, 'SUPER FEVER!\nx25 / 10s', 'float-text-sweet');
                // 画面揺れ演出
                playArea.classList.add('shake-effect');
                setTimeout(() => playArea.classList.remove('shake-effect'), 500);
            } else if (type === 'rainbow') {
                // レインボー: 3分分のCPS (強すぎたため調整)
                const gain = Math.max(totalCps * 180, totalCps * 60, 5000);
                const previousLevel = playerLevel;
                cookies += gain;
                totalBaked += gain;
                checkLevelUp();
                const rainbowText = `レインボーボーナス！\n+${Math.floor(gain).toLocaleString()} クッキー`;
                if (playerLevel > previousLevel) {
                    setTimeout(() => {
                        spawnFloatText(rareSweetTextPosition.x, rareSweetTextPosition.y, rainbowText, 'float-text-sweet float-text-rainbow', 1900);
                    }, 700);
                } else {
                    spawnFloatText(rareSweetTextPosition.x, rareSweetTextPosition.y, rainbowText, 'float-text-sweet float-text-rainbow', 1900);
                }
                triggerMilestoneLevelEffect(playerLevel); // 豪華なエフェクトを流用
            }
            
            sweet.remove();
            updateDisplay();
            saveGame();
        });

        goldenSweetContainer.appendChild(sweet);
        setTimeout(() => {
            if (sweet.parentNode) sweet.remove();
        }, 8000);
    }

    // ゴールデンお菓子の出現ループ
    function goldenSweetLoop() {
        const baseMin = 60;
        const baseMax = 120;
        // 基本1 + プレミアムレベル (Lv.1で2倍、Lv.2で3倍...)
        const divisor = 1 + premiumUpgrades['premium-spawn'].level + sweetCompendiumSpawnBonus;
        const nextSpawn = ((baseMin + Math.random() * (baseMax - baseMin)) / divisor) * 1000;
        
        setTimeout(() => {
            spawnGoldenSweet();
            goldenSweetLoop();
        }, nextSpawn);
    }
    goldenSweetLoop();

    function getLevelTarget(level) {
        if (level <= 1) return 0;
        // 指数を 2.2 -> 2.8 に引き上げてレベルアップを難化
        return Math.floor(100 * Math.pow(level - 1, 2.8));
    }

    function getClickLevelBonusMultiplier() {
        return 1 + ((playerLevel - 1) * 0.01);
    }

    function getCpsLevelBonusMultiplier() {
        return 1 + (Math.floor(playerLevel / 5) * 0.02);
    }

    function spawnMilestoneMessage(level) {
        const message = document.createElement('div');
        message.className = 'milestone-level-text';
        const title = level === 10 ? 'MASTER!' : level === 20 ? 'LEGEND!' : level === 30 ? 'GODLIKE!' : 'ULTIMATE!';
        message.textContent = `LEVEL ${level} ${title}`;
        document.body.appendChild(message);
        setTimeout(() => message.remove(), 1800);
    }

    function triggerMilestoneLevelEffect(level) {
        const viewportCenter = getViewportCenter();
        const flash = document.createElement('div');
        flash.className = 'milestone-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 700);

        const particles = ['👑', '🏆', '✨', '💎'];
        for (let i = 0; i < 24; i++) {
            const particle = document.createElement('div');
            particle.className = 'purchase-particle';
            particle.textContent = particles[i % particles.length];
            particle.style.left = '50%';
            particle.style.top = '50%';
            document.body.appendChild(particle);

            const angle = (Math.random() * 360) * (Math.PI / 180);
            const velocity = 8 + Math.random() * 14;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity - 12;

            let x = viewportCenter.x;
            let y = viewportCenter.y;
            let curVx = vx;
            let curVy = vy;
            const gravity = 0.45;

            const animate = () => {
                x += curVx;
                y += curVy;
                curVy += gravity;
                particle.style.transform = `translate(${x - viewportCenter.x}px, ${y - viewportCenter.y}px) scale(1.1) rotate(${curVy * 10}deg)`;
                particle.style.opacity = parseFloat(particle.style.opacity || 1) - 0.018;

                if (y < (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 80 && parseFloat(particle.style.opacity) > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };

            requestAnimationFrame(animate);
        }

        spawnMilestoneMessage(level);
        playSpecialSound(1320, 0.35);
        setTimeout(() => playSpecialSound(1760, 0.4), 120);
    }

    function grantLevelReward(level, silent = false) {
        const baseReward = Math.max(100, Math.floor(getLevelTarget(level + 1) * 0.05));
        let rewardCookies = baseReward;
        let rewardJewels = 0;

        // 報酬を全体的に削減
        if (level % 5 === 0) {
            rewardCookies += Math.max(200, Math.floor(getLevelTarget(level + 1) * 0.05));
            rewardJewels += 2; // 以前より大幅減
        }

        if (level % 10 === 0) {
            rewardCookies += Math.max(1000, Math.floor(getLevelTarget(level + 1) * 0.1));
            rewardJewels += 5; // 以前より大幅減
        }

        cookies += rewardCookies;
        jewels += rewardJewels;

        if (!silent) {
            playerLevelBox.classList.add('level-up');
            setTimeout(() => playerLevelBox.classList.remove('level-up'), 600);
            if (level % 10 === 0) {
                triggerMilestoneLevelEffect(level);
            } else {
                playSpecialSound(990, 0.25);
                triggerPurchaseEffect('⭐');
            }

            const rewardText = rewardJewels > 0
                ? `LEVEL UP! Lv.${level} +${Math.floor(rewardCookies).toLocaleString()} / +💎${rewardJewels}`
                : `LEVEL UP! Lv.${level} +${Math.floor(rewardCookies).toLocaleString()}`;
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, rewardText, 'float-text-centered');
        }
    }

    function checkLevelUp() {
        let leveledUp = false;
        let milestoneReached = false;
        let lastMilestone = 0;
        let startLevel = playerLevel;

        while (totalBaked >= getLevelTarget(playerLevel + 1)) {
            playerLevel++;
            leveledUp = true;
            
            // 静かに報酬を受け取る
            grantLevelReward(playerLevel, true);

            if (playerLevel % 10 === 0) {
                milestoneReached = true;
                lastMilestone = playerLevel;
            }
        }

        if (leveledUp) {
            playerLevelBox.classList.add('level-up');
            setTimeout(() => playerLevelBox.classList.remove('level-up'), 600);

            if (milestoneReached) {
                triggerMilestoneLevelEffect(lastMilestone);
            } else {
                playSpecialSound(990, 0.25);
                triggerPurchaseEffect('⭐');
            }

            const levelDiff = playerLevel - startLevel;
            const rewardText = levelDiff > 1 
                ? `LEVEL UP! Lv.${playerLevel} (+${levelDiff} levels!)`
                : `LEVEL UP! Lv.${playerLevel}`;
            
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, rewardText, 'float-text-centered');
        }
    }

    // プレミアム強化の購入処理
    document.querySelectorAll('.buy-premium-btn:not(.charge)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const upgradeId = e.target.closest('.upgrade-item').id;
            const upgrade = premiumUpgrades[upgradeId];
            
            // コスト計算 (レベルに応じて2倍ずつ増加)
            const currentCost = upgrade.baseCost * Math.pow(2, upgrade.level);

            if (jewels >= currentCost) {
                jewels -= currentCost;
                upgrade.level++;
                upgrade.purchased = true;
                
                // 特定の効果適用 (オートクリッカー開始など)
                if (upgradeId === 'premium-autoclick') {
                    startAutoClicker();
                }
                
                updateDisplay();
                saveGame();
                triggerPurchaseEffect('💎');
            }
        });
    });

    // 課金アイテムのクリック処理
    document.querySelectorAll('.billing-item').forEach(item => {
        item.addEventListener('click', () => {
            const amount = parseInt(item.getAttribute('data-amount'));
            const price = item.getAttribute('data-price');
            const name = item.querySelector('.item-name').textContent;

            pendingBillingAmount = amount;
            billingProductName.textContent = name;
            billingProductPrice.textContent = price;
            billingModal.classList.remove('hidden');
        });
    });

    billingCancelBtn.addEventListener('click', () => {
        billingModal.classList.add('hidden');
        pendingBillingAmount = 0;
    });

    billingConfirmBtn.addEventListener('click', () => {
        if (pendingBillingAmount > 0) {
            jewels += pendingBillingAmount;
            triggerPurchaseEffect('💎');
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, `+💎${pendingBillingAmount} PURCHASED!`);
            
            billingModal.classList.add('hidden');
            pendingBillingAmount = 0;
            updateDisplay();
            saveGame();
        }
    });

    // 広告ボーナスの処理
    document.querySelectorAll('.ad-reward-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = btn.getAttribute('data-type');
            if (Date.now() < cooldowns[type]) return;

            let duration = 5;
            if (type === 'fever') duration = 5;
            if (type === 'jewel') duration = 10;
            if (type === 'boost') duration = 15;

            const rewarded = await requestRewardedAd(type, duration);
            if (!rewarded) return;

                giveAdReward(type);
                cooldowns[type] = Date.now() + COOLDOWN_DURATIONS[type] * 1000;
                updateDisplay();
                saveGame();
        });
    });

    function getRewardedAdUnitId() {
        const platform = getAdPlatform();
        return ADS_CONFIG[platform]?.rewardedAdUnitId || ADS_CONFIG.android.rewardedAdUnitId;
    }

    async function requestIosTrackingIfNeeded(admobPlugin) {
        if (!admobPlugin?.trackingAuthorizationStatus || !admobPlugin?.requestTrackingAuthorization) return;
        if (window.Capacitor?.getPlatform?.() !== 'ios') return;

        try {
            const statusResult = await admobPlugin.trackingAuthorizationStatus();
            if (statusResult?.status !== 'notDetermined') return;
            await admobPlugin.requestTrackingAuthorization();
        } catch (error) {
            console.warn('ATT request skipped:', error);
        }
    }

    async function initializeAdMobPlugin() {
        const admobPlugin = window.Capacitor?.Plugins?.AdMob;
        if (!admobPlugin || admobInitialized || !admobPlugin.initialize) return;

        await requestIosTrackingIfNeeded(admobPlugin);
        await admobPlugin.initialize();
        admobInitialized = true;
    }

    async function showCommunityRewardedAd(payload) {
        const admobPlugin = window.Capacitor?.Plugins?.AdMob;
        if (!admobPlugin?.prepareRewardVideoAd || !admobPlugin?.showRewardVideoAd) return null;

        await initializeAdMobPlugin();

        if (!admobPlugin.addListener) {
            await admobPlugin.prepareRewardVideoAd({
                adId: payload.adUnitId,
                isTesting: false
            });
            await admobPlugin.showRewardVideoAd();
            return true;
        }

        let rewardEarned = false;
        let resolved = false;
        const listenerHandles = [];

        const clearListeners = async () => {
            await Promise.all(listenerHandles.map(async handle => {
                if (handle?.remove) {
                    await handle.remove();
                }
            }));
        };

        const finish = async (value, resolve) => {
            if (resolved) return;
            resolved = true;
            await clearListeners();
            resolve(value);
        };

        return new Promise(async resolve => {
            try {
                listenerHandles.push(await admobPlugin.addListener('onRewardedVideoAdReward', () => {
                    rewardEarned = true;
                }));
                listenerHandles.push(await admobPlugin.addListener('onRewardedVideoAdDismissed', async () => {
                    await finish(rewardEarned, resolve);
                }));
                listenerHandles.push(await admobPlugin.addListener('onRewardedVideoAdFailedToLoad', async (info) => {
                    alert('広告の読み込みに失敗しました: ' + JSON.stringify(info));
                    await finish(false, resolve);
                }));
                listenerHandles.push(await admobPlugin.addListener('onRewardedVideoAdFailedToShow', async (info) => {
                    alert('広告の表示に失敗しました: ' + JSON.stringify(info));
                    await finish(false, resolve);
                }));

                await admobPlugin.prepareRewardVideoAd({
                    adId: payload.adUnitId,
                    isTesting: false
                });
                await admobPlugin.showRewardVideoAd();
            } catch (error) {
                alert('広告エラー: ' + error.message);
                console.error('Community AdMob rewarded flow failed:', error);
                await finish(false, resolve);
            }
        });
    }

    // 広告ボーナスの処理
    document.querySelectorAll('.ad-reward-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const type = btn.getAttribute('data-type');
            if (Date.now() < cooldowns[type]) return;

            let duration = 5;
            if (type === 'fever') duration = 5;
            if (type === 'jewel') duration = 10;
            if (type === 'boost') duration = 15;

            const rewarded = await requestRewardedAd(type, duration);
            if (!rewarded) return;

            giveAdReward(type);
            cooldowns[type] = Date.now() + COOLDOWN_DURATIONS[type] * 1000;
            updateDisplay();
            saveGame();
        });
    });

    async function showNativeRewardedAd(type) {
        const platform = getAdPlatform();
        const payload = {
            type,
            adUnitId: getRewardedAdUnitId(),
            appId: ADS_CONFIG[platform]?.appId || ADS_CONFIG.android.appId,
            platform
        };

        if (window.AndroidRewardedAd?.showRewardedAd) {
            const result = await Promise.resolve(window.AndroidRewardedAd.showRewardedAd(JSON.stringify(payload)));
            return result !== false && result !== 'false';
        }

        if (window.Capacitor?.Plugins?.AdMobBridge?.showRewardedAd) {
            const result = await window.Capacitor.Plugins.AdMobBridge.showRewardedAd(payload);
            return result?.rewarded !== false;
        }

        if (window.Capacitor?.Plugins?.AdMob?.showRewardedAd) {
            const result = await window.Capacitor.Plugins.AdMob.showRewardedAd(payload);
            return result?.rewarded !== false;
        }

        const communityRewarded = await showCommunityRewardedAd(payload);
        if (communityRewarded !== null) {
            return communityRewarded;
        }

        return false;
    }

    function startAdSimulation(duration) {
        return new Promise(resolve => {
            adOverlay.classList.remove('hidden');
            let timeLeft = duration;
            adTimerCount.textContent = timeLeft;
            adProgress.style.width = '0%';

            const interval = setInterval(() => {
                timeLeft--;
                adTimerCount.textContent = timeLeft;
                adProgress.style.width = `${((duration - timeLeft) / duration) * 100}%`;

                if (timeLeft <= 0) {
                    clearInterval(interval);
                    adOverlay.classList.add('hidden');
                    resolve(true);
                }
            }, 1000);
        });
    }

    async function requestRewardedAd(type, fallbackDuration) {
        if (rewardedAdBusy) return false;

        rewardedAdBusy = true;
        try {
            if (hasNativeRewardedAdBridge()) {
                return await showNativeRewardedAd(type);
            }

            return await startAdSimulation(fallbackDuration);
        } catch (error) {
            console.error('Rewarded ad failed:', error);
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, '広告を読み込めませんでした');
            return false;
        } finally {
            rewardedAdBusy = false;
        }
    }

    function giveAdReward(type) {
        if (type === 'fever') {
            startFeverTime();
        } else if (type === 'jewel') {
            jewels += 5;
            updateDisplay();
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, '+💎5');
        } else if (type === 'boost') {
            adBoostActive = true;
            boostEndTime = Date.now() + 600 * 1000; // 10分
            updateDisplay();
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, 'PRODUCTION 2X!');
        } else if (type === 'offline_double') {
            const amount = pendingOfflineCookies * 2;
            cookies += amount;
            totalBaked += amount;
            pendingOfflineCookies = 0;
            offlineModal.classList.add('hidden');
            updateDisplay();
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, `+${Math.floor(amount).toLocaleString()}`);
        } else if (type === 'daily_triple') {
            // 現在のCPSの3時間分をベースにする (最低1000枚)
            const base = Math.max(1000, totalCps * 3600);
            const cookiesAmount = base * 3;
            const jewelsAmount = 3 * 3;
            
            cookies += cookiesAmount;
            totalBaked += cookiesAmount;
            jewels += jewelsAmount;
            
            dailyModal.classList.add('hidden');
            updateDisplay();
            const viewportCenter = getViewportCenter();
            spawnFloatText(viewportCenter.x, viewportCenter.y, `+${Math.floor(cookiesAmount).toLocaleString()} cookies\n+💎${jewelsAmount}`);
        }
    }

    // デイリーボーナスのチェック
    function checkDailyBonus() {
        const today = new Date().toDateString();
        if (lastLoginDate !== today) {
            const baseReward = Math.max(1000, totalCps * 3600);
            dailyCookiesReward.textContent = Math.floor(baseReward).toLocaleString();
            dailyModal.classList.remove('hidden');
            lastLoginDate = today;
            saveGame();
        }
    }

    claimDailyBtn.addEventListener('click', () => {
        const baseReward = Math.max(1000, totalCps * 3600);
        cookies += baseReward;
        totalBaked += baseReward;
        jewels += 3;
        
        dailyModal.classList.add('hidden');
        updateDisplay();
        const viewportCenter = getViewportCenter();
        spawnFloatText(viewportCenter.x, viewportCenter.y, `+${Math.floor(baseReward).toLocaleString()} cookies\n+💎3`);
        saveGame();
    });

    adTripleDailyBtn.addEventListener('click', async () => {
        const rewarded = await requestRewardedAd('daily_triple', 15);
        if (!rewarded) return;
            giveAdReward('daily_triple');
            saveGame();
    });

    // 設定パネルの操作
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('hidden');
        updateDisplay();
    });

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        updateSoundButton();
        saveGame();
    });

    autoSoundToggleBtn.addEventListener('click', () => {
        autoClickerSoundEnabled = !autoClickerSoundEnabled;
        updateAutoClickerSettingsButtons();
        saveGame();
    });

    autoHapticsToggleBtn.addEventListener('click', () => {
        autoClickerHapticsEnabled = !autoClickerHapticsEnabled;
        updateAutoClickerSettingsButtons();
        saveGame();
    });

    autoclickerStatus.addEventListener('click', () => {
        const unlocked = premiumUpgrades['premium-autoclick'].purchased && premiumUpgrades['premium-autoclick'].level > 0;
        if (!unlocked) return;
        autoClickerEnabled = !autoClickerEnabled;
        if (autoClickerEnabled) {
            startAutoClicker();
        } else {
            stopAutoClicker();
        }
        updateAutoClickerIndicator();
        saveGame();
    });

    function updateSoundButton() {
        if (soundEnabled) {
            soundToggleBtn.textContent = 'ON';
            soundToggleBtn.classList.add('on');
            soundToggleBtn.classList.remove('off');
        } else {
            soundToggleBtn.textContent = 'OFF';
            soundToggleBtn.classList.add('off');
            soundToggleBtn.classList.remove('on');
        }
    }

    function updateToggleButton(button, enabled) {
        if (!button) return;
        button.textContent = enabled ? 'ON' : 'OFF';
        button.classList.toggle('on', enabled);
        button.classList.toggle('off', !enabled);
    }

    function updateAutoClickerSettingsButtons() {
        updateToggleButton(autoSoundToggleBtn, autoClickerSoundEnabled);
        updateToggleButton(autoHapticsToggleBtn, autoClickerHapticsEnabled);
    }

    resetBtnMain.addEventListener('click', () => {
        if (confirm('セーブデータを削除して最初からやり直しますか？')) {
            localStorage.removeItem('cookieClickerSave');
            location.reload();
        }
    });

    // オフライン報酬のチェック
    function checkOfflineBonus() {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - lastSaveTime) / 1000);
        
        // 1分以上、かつ生産力がある場合
        if (elapsedSeconds >= 60 && totalCps > 0) {
            // 最大24時間 (86400秒)
            const cappedSeconds = Math.min(elapsedSeconds, 86400);
            
            // 効率: 基本 25%、1レベルごとに 15% アップ (最大 100% 弱)
            const efficiency = 0.25 + (premiumUpgrades['premium-offline'].level * 0.15);
            const earnings = cappedSeconds * totalCps * efficiency;
            
            pendingOfflineCookies = earnings;
            offlineCookiesDisplay.textContent = Math.floor(earnings).toLocaleString();
            offlineModal.classList.remove('hidden');
        }
    }

    claimOfflineBtn.addEventListener('click', () => {
        cookies += pendingOfflineCookies;
        totalBaked += pendingOfflineCookies;
        const amount = pendingOfflineCookies;
        pendingOfflineCookies = 0;
        offlineModal.classList.add('hidden');
        
        checkLevelUp();
        
        updateDisplay();
        const viewportCenter = getViewportCenter();
        spawnFloatText(viewportCenter.x, viewportCenter.y, `+${Math.floor(amount).toLocaleString()}`);
        saveGame();
    });

    adDoubleOfflineBtn.addEventListener('click', async () => {
        const rewarded = await requestRewardedAd('offline_double', 10);
        if (!rewarded) return;
            giveAdReward('offline_double');
            saveGame();
    });

    function updateAutoClickerIndicator() {
        const unlocked = premiumUpgrades['premium-autoclick'].purchased && premiumUpgrades['premium-autoclick'].level > 0;
        autoclickerStatus.classList.toggle('hidden', !unlocked);
        if (!unlocked) return;
        autoclickerStatus.classList.toggle('off', !autoClickerEnabled);
        const autoclickerText = autoclickerStatus.querySelector('.autoclicker-text');
        if (autoclickerText) {
            autoclickerText.textContent = autoClickerEnabled ? 'AUTO ON' : 'AUTO OFF';
        }
    }

    function stopAutoClicker() {
        if (window.autoClickInterval) {
            clearInterval(window.autoClickInterval);
            window.autoClickInterval = null;
        }
    }

    function startAutoClicker() {
        if (!premiumUpgrades['premium-autoclick'].purchased || !autoClickerEnabled) return;
        
        // すでに動いている場合は一度クリア (レベルアップ時などの再起動用)
        stopAutoClicker();

        // レベルに応じて速度アップ (1000msから開始、1Lvにつき200ms短縮、最短100ms)
        const speed = Math.max(100, 1000 - (premiumUpgrades['premium-autoclick'].level * 200));

        window.autoClickInterval = setInterval(() => {
            // 仮想的に中央をクリック
            const rect = cookieBtn.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // クッキー加算ロジック (clickイベントを直接呼ぶのは座標が取れないため、ロジックを共通化)
            simulateCookieClick(x, y, {
                silentClickSound: !autoClickerSoundEnabled,
                silentHaptics: !autoClickerHapticsEnabled
            });
        }, speed);

        updateAutoClickerIndicator();
    }

    function simulateCookieClick(x, y, options = {}) {
        const { silentClickSound = false, silentHaptics = false } = options;
        
        // フィーバー倍率の計算
        let feverMult = 1;
        if (isFeverActive) {
            // 基本倍率 (通常7倍、またはスーパーフィーバー等の特殊倍率)
            feverMult = currentFeverMultiplier;
            // プレミアム強化分 (+1Lvにつき +5)
            feverMult += (premiumUpgrades['premium-fever'].level * 5);
        }
        
        // 基本倍率 × レベル (未購入時は1)
        const clickUpgradeMult = passiveBuffs['upgrade-click'].purchased ? (passiveBuffs['upgrade-click'].multiplier * passiveBuffs['upgrade-click'].level) : 1;
        const levelClickMult = getClickLevelBonusMultiplier();
        const adBoostMult = adBoostActive ? 2 : 1;
        
        // コンボボーナス (50コンボごとに +10% ずつ、最大 +100%)
        const comboBonus = Math.min(1.0, Math.floor(currentCombo / 50) * 0.1);
        const comboMult = 1.0 + comboBonus;

        // クリティカル判定 (5%の確率で 10倍)
        const isCritical = Math.random() < 0.05;
        const criticalMult = isCritical ? 10 : 1;

        const baseAmount = feverMult * clickUpgradeMult * levelClickMult * adBoostMult * comboMult;
        const amount = baseAmount * criticalMult;
        
        cookies += amount;
        totalBaked += amount;
        checkLevelUp();
        
        const now = Date.now();
        if (now - lastClickTime < 1000) {
            currentCombo++;
            if (currentCombo > maxCombo) maxCombo = currentCombo;
            
            // コンボ表示の更新
            if (currentCombo >= 2) {
                comboDisplay.classList.remove('hidden');
                comboDisplay.textContent = `${currentCombo} COMBO`;
                // コンボ数に応じて色や大きさを変える演出
                if (currentCombo >= 100) {
                    comboDisplay.style.color = '#fa5252';
                    comboDisplay.style.transform = 'translateX(-50%) scale(1.5)';
                } else if (currentCombo >= 50) {
                    comboDisplay.style.color = '#fab005';
                    comboDisplay.style.transform = 'translateX(-50%) scale(1.2)';
                } else {
                    comboDisplay.style.color = 'white';
                    comboDisplay.style.transform = 'translateX(-50%) scale(1.0)';
                }
            }
        } else {
            currentCombo = 1;
            comboDisplay.classList.add('hidden');
        }
        lastClickTime = now;

        if (!silentClickSound) {
            playClickSound(isCritical);
        }
        
        if (!silentHaptics) {
            triggerHaptic(isCritical ? 'medium' : 'light');
        }
        cookieBtn.classList.add('cookie-clicked');
        setTimeout(() => cookieBtn.classList.remove('cookie-clicked'), 160);

        if (isCritical) {
            spawnFloatText(x, y, `CRITICAL!! +${Math.floor(amount).toLocaleString()}`);
            playSpecialSound(660, 0.2); // クリティカル音
            if (!silentHaptics) {
                triggerHaptic('heavy');
            }
        } else {
            spawnFloatText(x, y, `+${Math.floor(amount).toLocaleString()}`);
        }
        updateDisplay();
    }

    // クッキーをクリック
    cookieBtn.addEventListener('click', (e) => {
        e.preventDefault(); // デフォルト動作（ズームなど）を防止
        simulateCookieClick(e.clientX, e.clientY);
    }, { passive: false });

    // 建物の購入処理
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const parentId = e.target.closest('.upgrade-item').id;
            const upgrade = upgrades[parentId];
            
            if (cookies >= upgrade.cost) {
                cookies -= upgrade.cost;
                upgrade.count += 1;
                // 次のコストを計算 (1.15倍)
                upgrade.cost = upgrade.baseCost * Math.pow(1.15, upgrade.count);
                
                calculateCps();
                updateDisplay();
                saveGame();

                // 購入演出の発動 (アイテム名から絵文字を抽出)
                const itemName = e.target.closest('.upgrade-item').querySelector('.item-name').textContent;
                const emojiMatch = itemName.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u);
                const emoji = emojiMatch ? emojiMatch[0] : '🏗️';
                triggerPurchaseEffect(emoji);
            }
        });
    });

    // アップグレードの購入処理
    document.querySelectorAll('.buy-upgrade-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const upgradeId = e.target.closest('.upgrade-item').id;
            const upgrade = passiveBuffs[upgradeId];
            const itemCard = e.target.closest('.upgrade-item');
            
            if (!upgrade.purchased) {
                // 初回購入 (クッキー)
                if (cookies >= upgrade.cost) {
                    cookies -= upgrade.cost;
                    upgrade.purchased = true;
                    upgrade.level = 1;
                    calculateCps();
                    updateDisplay();
                    saveGame();
                    
                    // 購入演出
                    const itemName = itemCard.querySelector('.item-name').textContent;
                    const emojiMatch = itemName.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u);
                    const emoji = emojiMatch ? emojiMatch[0] : '✨';
                    triggerPurchaseEffect(emoji);
                }
            } else {
                const rewarded = await requestRewardedAd(`upgrade_${upgradeId}`, 10);
                if (!rewarded) return;
                    upgrade.level++;
                    calculateCps();
                    updateDisplay();
                    saveGame();
                    
                    const itemName = itemCard.querySelector('.item-name').textContent;
                    const emojiMatch = itemName.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u);
                    const emoji = emojiMatch ? emojiMatch[0] : '🆙';
                    triggerPurchaseEffect(emoji);
            }
        });
    });

    // 表示更新
    function updateDisplay() {
        // ブースト期間の確認
        if (adBoostActive && Date.now() > boostEndTime) {
            adBoostActive = false;
        }

        updateAutoClickerIndicator();

        // フィーバー倍率: 基本7倍 + プレミアム強化(1Lvにつき+5)
        const premiumFeverBonus = premiumUpgrades['premium-fever'].level * 5;
        const feverMult = isFeverActive ? (7 + premiumFeverBonus) : 1;
        // 1.0 + (基本0.2 + (レベル-1) * 0.05)
        const globalLevelBonus = passiveBuffs['upgrade-global'].purchased ? (0.2 + (passiveBuffs['upgrade-global'].level - 1) * 0.05) : 0;
        const globalMult = 1.0 + globalLevelBonus;
        const cpsLevelMult = getCpsLevelBonusMultiplier();
        const adBoostMult = adBoostActive ? 2 : 1;
        
        const displayCps = totalCps * feverMult * globalMult * cpsLevelMult * adBoostMult;
        
        cookieCountDisplay.textContent = Math.floor(cookies).toLocaleString();
        if (jewelCountDisplay) jewelCountDisplay.textContent = jewels.toLocaleString();
        cpsDisplay.textContent = displayCps.toFixed(1);
        const currentLevelTarget = getLevelTarget(playerLevel);
        const nextLevelTarget = getLevelTarget(playerLevel + 1);
        const levelProgress = nextLevelTarget > currentLevelTarget ? ((totalBaked - currentLevelTarget) / (nextLevelTarget - currentLevelTarget)) * 100 : 100;
        playerLevelText.textContent = `Lv.${playerLevel} 次まで ${Math.max(0, Math.ceil(nextLevelTarget - totalBaked)).toLocaleString()}`;
        playerLevelProgress.style.width = `${Math.max(0, Math.min(100, levelProgress))}%`;

        let buyableBuildings = 0;
        let buildingCount = 0;

        // 各建物ボタンの更新
        Object.keys(upgrades).forEach(id => {
            const item = upgrades[id];
            const itemDiv = document.getElementById(id);
            if (!itemDiv) return;

            const button = itemDiv.querySelector('.buy-btn');
            const countDisplay = itemDiv.querySelector('.item-count');
            
            button.textContent = `${Math.floor(item.cost).toLocaleString()} cookies`;
            button.disabled = (cookies < item.cost);
            
            if (cookies >= item.cost) buyableBuildings++;
            
            countDisplay.textContent = item.count;
            buildingCount += item.count;
        });

        buildingBadge.textContent = buyableBuildings;
        buildingBadge.style.display = buyableBuildings > 0 ? 'block' : 'none';

        // アップグレードボタンの更新
        let buyableUpgrades = 0;
        Object.keys(passiveBuffs).forEach(id => {
            const upgrade = passiveBuffs[id];
            const itemDiv = document.getElementById(id);
            const button = itemDiv.querySelector('.buy-upgrade-btn');
            
            if (upgrade.purchased) {
                button.textContent = `🎬 広告で強化 (Lv.${upgrade.level})`;
                button.disabled = false; // 広告強化は常に可能
                itemDiv.style.opacity = '1.0';
                button.style.backgroundColor = '#4dabf7'; // 青色に変更して区別
            } else {
                button.textContent = `${Math.floor(upgrade.cost).toLocaleString()} cookies`;
                button.disabled = (cookies < upgrade.cost);
                button.style.backgroundColor = ''; // デフォルトに戻す
                if (cookies >= upgrade.cost) buyableUpgrades++;
            }
        });

        // プレミアムショップボタンの更新
        Object.keys(premiumUpgrades).forEach(id => {
            const upgrade = premiumUpgrades[id];
            const itemDiv = document.getElementById(id);
            const button = itemDiv.querySelector('.buy-premium-btn');
            const levelDisplay = itemDiv.querySelector('.item-count');
            if (!button) return;
            
            const currentCost = upgrade.baseCost * Math.pow(2, upgrade.level);
            levelDisplay.textContent = `Lv.${upgrade.level}`;
            button.textContent = `${currentCost} jewels`;
            button.disabled = (jewels < currentCost);
        });

        upgradeBadge.textContent = buyableUpgrades;
        upgradeBadge.style.display = buyableUpgrades > 0 ? 'block' : 'none';

        // ボーナス項目の更新 (クールダウン表示)
        let bonusAvailable = false;
        Object.keys(cooldowns).forEach(type => {
            const itemCard = document.getElementById(`bonus-ad-${type}`);
            if (!itemCard) return;
            const overlay = itemCard.querySelector('.cooldown-overlay');
            const timer = itemCard.querySelector('.cooldown-timer');
            const button = itemCard.querySelector('.ad-reward-btn');

            const now = Date.now();
            if (now < cooldowns[type]) {
                overlay.classList.remove('hidden');
                const remaining = Math.ceil((cooldowns[type] - now) / 1000);
                const min = Math.floor(remaining / 60);
                const sec = remaining % 60;
                timer.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                button.disabled = true;
            } else {
                overlay.classList.add('hidden');
                button.disabled = false;
                bonusAvailable = true;
            }
        });

        if (bonusBadge) bonusBadge.style.display = bonusAvailable ? 'block' : 'none';

        // 統計情報の更新
        statBonuses.textContent = bonusesEarned;
        statStartDate.textContent = gameStartDate;
        statTotalBaked.textContent = Math.floor(totalBaked).toLocaleString();
        statTotalBuildings.textContent = buildingCount;
        
        // クリック倍率の計算
        const clickLevelMult = passiveBuffs['upgrade-click'].purchased ? (passiveBuffs['upgrade-click'].multiplier * passiveBuffs['upgrade-click'].level) : 1;
        let clickPower = clickLevelMult * getClickLevelBonusMultiplier() * feverMult * adBoostMult;
        statCookiesPerClick.textContent = clickPower; 
        
        statMaxCombo.textContent = maxCombo;
        updateSweetEncyclopedia();
    }

    // 浮遊テキストエフェクト
    function spawnFloatText(x, y, text, extraClass = '', duration = 1300) {
        const safePosition = clampEffectPosition(x, y);
        const span = document.createElement('span');
        span.className = extraClass ? `float-text ${extraClass}` : 'float-text';
        if (isFeverActive) span.style.color = '#d4af37'; // フィーバー中は金色の文字
        span.textContent = text;
        span.style.left = `${safePosition.x}px`;
        span.style.top = `${safePosition.y}px`;
        document.body.appendChild(span);
        setTimeout(() => span.remove(), duration);
    }

    // お菓子が降ってくるエフェクト
    function spawnFallingCookie() {
        const sweets = ['🍪', '🍬', '🍨', '🍫', '🍰', '🍹', '🍭', '🍩', '🍮'];
        const randomSweet = sweets[Math.floor(Math.random() * sweets.length)];
        
        const cookie = document.createElement('div');
        cookie.className = 'falling-cookie';
        cookie.textContent = randomSweet;
        cookie.style.left = Math.random() * 100 + '%';
        const duration = isFeverActive ? (1.5 + Math.random() * 2) : (3 + Math.random() * 4);
        cookie.style.animationDuration = duration + 's';
        cookie.style.opacity = isFeverActive ? (0.6 + Math.random() * 0.4) : (0.4 + Math.random() * 0.4);
        cookie.style.fontSize = (isFeverActive ? (2 + Math.random() * 2) : (1.5 + Math.random() * 2)) + 'rem';
        
        playArea.appendChild(cookie);
        setTimeout(() => cookie.remove(), duration * 1000);
    }

    // 定期的に降らせる (CPSに応じて頻度を上げる)
    function startFallingCookies() {
        const baseInterval = 500; 
        
        function tick() {
            spawnFallingCookie();
            // 次の降ってくるまでの時間をCPSに基づいて計算 (最低50msまで短縮)
            // フィーバー中はさらに2倍の頻度
            let nextInterval = Math.max(50, baseInterval / (1 + totalCps / 5));
            if (isFeverActive) nextInterval /= 2;
            
            setTimeout(tick, nextInterval);
        }
        tick();
    }
    startFallingCookies();

    // 効果音 (Web Audio API を使用して簡易生成)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playClickSound(isCritical = false) {
        if (!soundEnabled) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const bodyOsc = audioCtx.createOscillator();
        const bodyGain = audioCtx.createGain();
        const clickOsc = audioCtx.createOscillator();
        const clickGain = audioCtx.createGain();

        bodyOsc.connect(bodyGain);
        clickOsc.connect(clickGain);
        bodyGain.connect(audioCtx.destination);
        clickGain.connect(audioCtx.destination);

        bodyOsc.type = 'triangle';
        clickOsc.type = 'square';

        bodyOsc.frequency.setValueAtTime(isCritical ? 220 : 180, now);
        bodyOsc.frequency.exponentialRampToValueAtTime(isCritical ? 120 : 90, now + 0.08);
        bodyGain.gain.setValueAtTime(isCritical ? 0.12 : 0.09, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        clickOsc.frequency.setValueAtTime(isCritical ? 1800 : 1450, now);
        clickGain.gain.setValueAtTime(isCritical ? 0.07 : 0.05, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        bodyOsc.start(now);
        clickOsc.start(now);
        bodyOsc.stop(now + 0.09);
        clickOsc.stop(now + 0.03);
    }

    function playSpecialSound(freq, duration) {
        if (!soundEnabled) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function playPurchaseSound() {
        if (!soundEnabled) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        const gain2 = audioCtx.createGain();
        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(audioCtx.destination);
        gain2.connect(audioCtx.destination);
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc2.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.1);
        gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        gain2.gain.setValueAtTime(0.08, audioCtx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc1.start(audioCtx.currentTime);
        osc2.start(audioCtx.currentTime + 0.1);
        osc1.stop(audioCtx.currentTime + 0.15);
        osc2.stop(audioCtx.currentTime + 0.3);
    }

    function playSweetSpawnSound(type) {
        if (type === 'normal') {
            playSpecialSound(1040, 0.12);
        } else if (type === 'jewel') {
            playSpecialSound(1320, 0.18);
        } else if (type === 'super') {
            playSpecialSound(420, 0.12);
            setTimeout(() => playSpecialSound(840, 0.18), 70);
        } else if (type === 'rainbow') {
            playSpecialSound(660, 0.12);
            setTimeout(() => playSpecialSound(990, 0.12), 80);
            setTimeout(() => playSpecialSound(1320, 0.18), 160);
        }
    }

    function playSweetCollectSound(type) {
        if (type === 'normal') {
            playSpecialSound(1180, 0.16);
        } else if (type === 'jewel') {
            playSpecialSound(1480, 0.18);
            setTimeout(() => playSpecialSound(1760, 0.16), 70);
        } else if (type === 'super') {
            playSpecialSound(520, 0.1);
            setTimeout(() => playSpecialSound(1040, 0.15), 60);
            setTimeout(() => playSpecialSound(1560, 0.2), 140);
        } else if (type === 'rainbow') {
            playSpecialSound(880, 0.1);
            setTimeout(() => playSpecialSound(1320, 0.12), 70);
            setTimeout(() => playSpecialSound(1760, 0.2), 150);
        }
    }

    function unlockSweetDiscovery(type, x = null, y = null) {
        const isFirstDiscovery = discoveredSweets[type] === 0;
        discoveredSweets[type] = (discoveredSweets[type] || 0) + 1;
        updateSweetEncyclopedia();
        if (isFirstDiscovery && x !== null && y !== null) {
            spawnFloatText(x, y, 'NEW! 図鑑登録');
        }
        checkSweetCompendiumReward(x, y);
    }

    function checkSweetCompendiumReward(x = null, y = null) {
        const isComplete = Object.values(discoveredSweets).every(count => count > 0);
        if (!isComplete || sweetCompendiumRewardClaimed) return;

        sweetCompendiumRewardClaimed = true;
        sweetCompendiumSpawnBonus = 0.5;
        jewels += 30;
        updateSweetEncyclopedia();
        if (x !== null && y !== null) {
            spawnFloatText(x, y, '図鑑COMPLETE!\n+💎30');
        }
        celebrateSweetCompendiumComplete();
        saveGame();
    }

    function celebrateSweetCompendiumComplete() {
        if (sweetCompleteBanner) {
            sweetCompleteBanner.classList.remove('hidden');
        }

        triggerHaptic('light');
        playSpecialSound(784, 0.14);
        setTimeout(() => playSpecialSound(1046, 0.16), 110);
        setTimeout(() => playSpecialSound(1318, 0.2), 220);

        const sweets = ['🍬', '⭐', '🍭', '🍪'];
        const topBase = Math.max(110, (window.visualViewport ? window.visualViewport.offsetTop : 0) + 120);

        for (let i = 0; i < 12; i++) {
            const particle = document.createElement('span');
            particle.className = 'sweet-complete-particle';
            particle.textContent = sweets[i % sweets.length];
            particle.style.left = `${12 + Math.random() * 76}%`;
            particle.style.top = `${topBase + Math.random() * 40}px`;
            particle.style.animationDelay = `${i * 0.04}s`;
            particle.style.fontSize = `${1.1 + Math.random() * 0.55}rem`;
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 2800);
        }

        if (sweetRewardBox) {
            sweetRewardBox.classList.add('completed');
        }
    }

    function updateSweetEncyclopedia() {
        sweetEntries.forEach(entry => {
            const type = entry.dataset.sweetType;
            const count = discoveredSweets[type] || 0;
            const unlocked = count > 0;
            const nameEl = entry.querySelector('.sweet-entry-name');
            const descEl = entry.querySelector('.sweet-entry-desc');
            const countEl = entry.querySelector('.sweet-entry-count');
            entry.classList.toggle('locked', !unlocked);
            if (nameEl) {
                nameEl.textContent = unlocked ? nameEl.dataset.name : '???';
            }
            if (descEl) {
                descEl.textContent = unlocked ? descEl.dataset.desc : 'まだ見つけていません';
            }
            if (countEl) {
                countEl.textContent = `発見 ${count}回`;
            }
        });

        const isComplete = Object.values(discoveredSweets).every(count => count > 0);
        if (sweetCompleteBanner) {
            sweetCompleteBanner.classList.toggle('hidden', !sweetCompendiumRewardClaimed);
        }
        if (sweetRewardBox && sweetRewardStatus && sweetRewardDesc) {
            sweetRewardBox.classList.toggle('completed', sweetCompendiumRewardClaimed);
            sweetRewardStatus.textContent = sweetCompendiumRewardClaimed ? '達成済み!' : (isComplete ? '受取済み処理中' : '未達成');
            sweetRewardDesc.textContent = sweetCompendiumRewardClaimed
                ? '初回報酬: 💎30獲得済み / 永続ボーナス: レア出現率アップ中'
                : '4種類コンプリートで 💎30 + レア出現率アップ';
        }
    }

    // 購入時の派手な演出
    function triggerPurchaseEffect(emoji) {
        const viewportCenter = getViewportCenter();
        // 1. 画面フラッシュ
        const flash = document.createElement('div');
        flash.className = 'screen-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 300);

        // 2. 絵文字の噴水
        for (let i = 0; i < 15; i++) {
            const particle = document.createElement('div');
            particle.className = 'purchase-particle';
            particle.textContent = emoji;
            particle.style.left = '50%';
            particle.style.top = '50%';
            
            // ランダムな方向と強さ
            const angle = (Math.random() * 360) * (Math.PI / 180);
            const velocity = 5 + Math.random() * 10;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity - 10; // 上方向に強める
            
            document.body.appendChild(particle);
            
            let x = viewportCenter.x;
            let y = viewportCenter.y;
            let curVx = vx;
            let curVy = vy;
            const gravity = 0.5;
            
            const animate = () => {
                x += curVx;
                y += curVy;
                curVy += gravity;
                particle.style.transform = `translate(${x - viewportCenter.x}px, ${y - viewportCenter.y}px) rotate(${curVy * 10}deg)`;
                particle.style.opacity = parseFloat(particle.style.opacity || 1) - 0.02;
                
                if (y < (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 50 && parseFloat(particle.style.opacity) > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };
            requestAnimationFrame(animate);
        }

        // 3. CPS数字のパンチ
        cpsDisplay.classList.add('stat-punch');
        setTimeout(() => cpsDisplay.classList.remove('stat-punch'), 500);
        
        // 4. 音
        playPurchaseSound();
    }
    // CPS (Cookies Per Second) の計算
    function calculateCps() {
        totalCps = 0;
        Object.keys(upgrades).forEach(id => {
            let itemCps = upgrades[id].count * upgrades[id].cps;
            
            // 建物特化の強化を適用
            Object.values(passiveBuffs).forEach(buff => {
                if (buff.purchased && buff.type === 'building' && buff.target === id) {
                    // 基本倍率 × レベル
                    itemCps *= (buff.multiplier * buff.level);
                }
            });
            
            totalCps += itemCps;
        });
    }

    // 毎秒の自動加算 (および表示の定期更新)
    setInterval(() => {
        // CPSによる加算
        if (totalCps > 0) {
            let feverMult = 1;
            if (isFeverActive) {
                feverMult = currentFeverMultiplier + (premiumUpgrades['premium-fever'].level * 5);
            }
            
            const globalLevelBonus = passiveBuffs['upgrade-global'].purchased ? (0.2 + (passiveBuffs['upgrade-global'].level - 1) * 0.05) : 0;
            const globalMult = 1.0 + globalLevelBonus;
            const cpsLevelMult = getCpsLevelBonusMultiplier();
            const adBoostMult = adBoostActive ? 2 : 1;
            const added = (totalCps * feverMult * globalMult * cpsLevelMult * adBoostMult) / 10;
            cookies += added;
            totalBaked += added;
            checkLevelUp();
        }
        
        // クールダウンやブースト時間の更新のために常に表示更新を行う
        updateDisplay();
    }, 100);

    // セーブ・ロード機能
    function saveGame() {
        lastSaveTime = Date.now();
        const saveData = {
            cookies,
            jewels,
            totalBaked,
            playerLevel,
            bonusesEarned,
            gameStartDate,
            maxCombo,
            upgrades,
            passiveBuffs,
            premiumUpgrades,
            adBoostActive,
            boostEndTime,
            cooldowns,
            lastSaveTime,
            soundEnabled,
            autoClickerEnabled,
            autoClickerSoundEnabled,
            autoClickerHapticsEnabled,
            lastLoginDate,
            discoveredSweets,
            sweetCompendiumRewardClaimed,
            sweetCompendiumSpawnBonus
        };
        localStorage.setItem('cookieClickerSave', JSON.stringify(saveData));
    }

    function loadGame() {
        const saved = localStorage.getItem('cookieClickerSave');
        if (saved) {
            const data = JSON.parse(saved);
            cookies = data.cookies || 0;
            jewels = data.jewels || 0;
            totalBaked = data.totalBaked || 0;
            playerLevel = data.playerLevel || 1;
            bonusesEarned = data.bonusesEarned || 0;
            gameStartDate = data.gameStartDate || new Date().toLocaleString();
            maxCombo = data.maxCombo || 0;
            adBoostActive = data.adBoostActive || false;
            boostEndTime = data.boostEndTime || 0;
            lastSaveTime = data.lastSaveTime || Date.now();
            soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
            autoClickerEnabled = data.autoClickerEnabled !== undefined ? data.autoClickerEnabled : true;
            autoClickerSoundEnabled = !!data.autoClickerSoundEnabled;
            autoClickerHapticsEnabled = !!data.autoClickerHapticsEnabled;
            lastLoginDate = data.lastLoginDate || "";
            if (data.cooldowns) cooldowns = data.cooldowns;
            if (data.discoveredSweets) {
                const normalizedSweets = {};
                Object.keys(discoveredSweets).forEach(type => {
                    const value = data.discoveredSweets[type];
                    normalizedSweets[type] = typeof value === 'boolean' ? (value ? 1 : 0) : (value || 0);
                });
                discoveredSweets = normalizedSweets;
            }
            sweetCompendiumRewardClaimed = !!data.sweetCompendiumRewardClaimed;
            sweetCompendiumSpawnBonus = data.sweetCompendiumSpawnBonus || 0;
            
            updateSoundButton();
            updateAutoClickerSettingsButtons();
            updateAutoClickerIndicator();
            
            if (data.upgrades) {
                Object.keys(data.upgrades).forEach(id => {
                    if (upgrades[id]) {
                        upgrades[id].count = data.upgrades[id].count;
                        upgrades[id].cost = data.upgrades[id].cost;
                    }
                });
            }

            if (data.passiveBuffs) {
                Object.keys(data.passiveBuffs).forEach(id => {
                    if (passiveBuffs[id]) {
                        passiveBuffs[id].purchased = data.passiveBuffs[id].purchased;
                        passiveBuffs[id].level = data.passiveBuffs[id].level || 1;
                    }
                });
            }

            if (data.premiumUpgrades) {
                Object.keys(data.premiumUpgrades).forEach(id => {
                    if (premiumUpgrades[id]) {
                        premiumUpgrades[id].purchased = data.premiumUpgrades[id].purchased;
                        premiumUpgrades[id].level = data.premiumUpgrades[id].level || 0;
                        if (id === 'premium-autoclick' && premiumUpgrades[id].level > 0) {
                            startAutoClicker();
                        }
                    }
                });
            }

            while (totalBaked >= getLevelTarget(playerLevel + 1)) {
                playerLevel++;
            }

            calculateCps();
            updateDisplay();
        }
    }

    // オートセーブ (30秒ごと)
    setInterval(saveGame, 30000);

    runStartupSequence();
});
