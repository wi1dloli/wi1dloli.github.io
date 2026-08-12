// ============================================================
// WI1DTRACK - MTG GAME TRACKER
// Token-only + single-faced + artifact-aware Scryfall search
// iOS 9.3.5 Compatible - WITH IMAGE FIXES FOR iPAD
// ============================================================

var STORAGE_KEY = 'mtg_state';
var SCRYFALL_API = 'https://api.scryfall.com';

// ============================================================
// POLYFILLS FOR iOS 9.3.5
// ============================================================

// Array.isArray polyfill
if (!Array.isArray) {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };
}

// Array.prototype.find polyfill
if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
        if (this === null) {
            throw new TypeError('Array.prototype.find called on null or undefined');
        }
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        var list = Object(this);
        var length = list.length >>> 0;
        var thisArg = arguments[1];
        var value;

        for (var i = 0; i < length; i++) {
            value = list[i];
            if (predicate.call(thisArg, value, i, list)) {
                return value;
            }
        }
        return undefined;
    };
}

// Array.prototype.filter polyfill
if (!Array.prototype.filter) {
    Array.prototype.filter = function(fun /*, thisArg*/) {
        if (this === void 0 || this === null) {
            throw new TypeError();
        }

        var t = Object(this);
        var len = t.length >>> 0;
        if (typeof fun !== 'function') {
            throw new TypeError();
        }

        var res = [];
        var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
        for (var i = 0; i < len; i++) {
            if (i in t) {
                var val = t[i];
                if (fun.call(thisArg, val, i, t)) {
                    res.push(val);
                }
            }
        }
        return res;
    };
}

// ============================================================
// STATE
// ============================================================

var state = loadState();

function loadState() {
    try {
        var saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return {
                lifeTotal: 40,
                tokens: []
            };
        }

        var parsed = JSON.parse(saved);

        return {
            lifeTotal: typeof parsed.lifeTotal === 'number' ? parsed.lifeTotal : 40,
            tokens: Array.isArray(parsed.tokens) ? parsed.tokens : []
        };

    } catch (error) {
        console.error('Could not load saved game state:', error);

        return {
            lifeTotal: 40,
            tokens: []
        };
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Could not save game state:', error);
    }
}

// ============================================================
// LIFE
// ============================================================

function adjustLife(amount) {
    state.lifeTotal += amount;
    saveToStorage();
    render();
}

// ============================================================
// TOKEN VALIDATION
// ============================================================

function isSingleFacedToken(card) {
    if (!card) {
        return false;
    }

    if (Array.isArray(card.card_faces)) {
        return false;
    }

    return true;
}

// ============================================================
// ARTIFACT DETECTION
// ============================================================

function isArtifactToken(card) {
    if (!card) {
        return false;
    }

    var typeLine = card.type_line || '';
    return /\bArtifact\b/i.test(typeLine);
}

// ============================================================
// ARTIFACT CREATURE DETECTION
// ============================================================

function isArtifactCreatureToken(card) {
    if (!card) {
        return false;
    }

    var typeLine = card.type_line || '';
    return /\bArtifact\b/i.test(typeLine) && /\bCreature\b/i.test(typeLine);
}

// ============================================================
// IMAGE HANDLING - FIXED FOR iOS 9.3.5
// ============================================================

function getCardImage(card) {
    if (!card) {
        return '';
    }

    // iOS 9.3.5 fix: Try multiple image sizes
    var imageUrls = [];
    
    // Try PNG first (better compatibility with older iOS)
    if (card.image_uris) {
        if (card.image_uris.png) {
            imageUrls.push(card.image_uris.png);
        }
        if (card.image_uris.large) {
            imageUrls.push(card.image_uris.large);
        }
        if (card.image_uris.normal) {
            imageUrls.push(card.image_uris.normal);
        }
        if (card.image_uris.small) {
            imageUrls.push(card.image_uris.small);
        }
        if (card.image_uris.art_crop) {
            imageUrls.push(card.image_uris.art_crop);
        }
    }

    // Also check card faces (for MDFC tokens)
    if (card.card_faces && Array.isArray(card.card_faces)) {
        card.card_faces.forEach(function(face) {
            if (face.image_uris) {
                if (face.image_uris.png) {
                    imageUrls.push(face.image_uris.png);
                }
                if (face.image_uris.normal) {
                    imageUrls.push(face.image_uris.normal);
                }
                if (face.image_uris.small) {
                    imageUrls.push(face.image_uris.small);
                }
                if (face.image_uris.art_crop) {
                    imageUrls.push(face.image_uris.art_crop);
                }
            }
        });
    }

    // Return the first available image
    return imageUrls.length > 0 ? imageUrls[0] : '';
}

// ============================================================
// TEST IMAGE ON iOS
// ============================================================

function isIOS9() {
    var ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && /OS 9_/.test(ua);
}

function loadImageWithFallback(url, callback) {
    if (!url) {
        callback(false);
        return;
    }

    // For iOS 9, try using a proxy or alternative URL
    var img = new Image();
    var timeout = setTimeout(function() {
        callback(false);
    }, 5000);

    img.onload = function() {
        clearTimeout(timeout);
        callback(true);
    };

    img.onerror = function() {
        clearTimeout(timeout);
        // Try with no-cors mode as fallback
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            xhr.onload = function() {
                if (xhr.status === 200) {
                    callback(true);
                } else {
                    callback(false);
                }
            };
            xhr.onerror = function() {
                callback(false);
            };
            xhr.send();
        } catch (e) {
            callback(false);
        }
    };

    img.src = url;
}

// ============================================================
// SCRYFALL AUTOCOMPLETE - WITH ATTRIBUTES
// ============================================================

var autocompleteTimer = null;
var autocompleteRequest = 0;
var cachedTokenResults = [];

function handleNameInput(query) {
    var box = document.getElementById('autocomplete-box');

    if (!box) {
        return;
    }

    clearTimeout(autocompleteTimer);

    query = query.trim();

    if (query.length < 2) {
        box.innerHTML = '';
        cachedTokenResults = [];
        return;
    }

    autocompleteTimer = setTimeout(function() {
        var requestNumber = ++autocompleteRequest;

        try {
            var searchQuery = 't:token name:' + query + '*';
            var url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(searchQuery) + '&unique=cards';

            fetch(url)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Scryfall token search returned HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (requestNumber !== autocompleteRequest) {
                        return;
                    }

                    box.innerHTML = '';

                    if (!Array.isArray(data.data)) {
                        cachedTokenResults = [];
                        return;
                    }

                    // Store all valid tokens for later use
                    cachedTokenResults = data.data.filter(function(card) {
                        return isSingleFacedToken(card);
                    });

                    if (cachedTokenResults.length === 0) {
                        box.innerHTML = '<div class="suggestion-item" style="color:#888;cursor:default;">No tokens found</div>';
                        return;
                    }

                    // Group by name to show variations
                    var groupedTokens = {};
                    cachedTokenResults.forEach(function(card) {
                        var name = card.name;
                        if (!groupedTokens[name]) {
                            groupedTokens[name] = [];
                        }
                        groupedTokens[name].push(card);
                    });

                    // Show each variation with full details
                    var names = Object.keys(groupedTokens);
                    names.forEach(function(name) {
                        var cards = groupedTokens[name];
                        
                        if (cards.length === 1) {
                            var card = cards[0];
                            var suggestion = document.createElement('div');
                            suggestion.className = 'suggestion-item';
                            suggestion.innerHTML = formatSuggestionHTML(card);
                            suggestion.addEventListener('click', function() {
                                selectToken(card);
                            });
                            box.appendChild(suggestion);
                        } else {
                            cards.forEach(function(card) {
                                var suggestion = document.createElement('div');
                                suggestion.className = 'suggestion-item suggestion-variant';
                                suggestion.innerHTML = formatSuggestionHTML(card);
                                suggestion.addEventListener('click', function() {
                                    selectToken(card);
                                });
                                box.appendChild(suggestion);
                            });
                        }
                    });

                })
                .catch(function(error) {
                    console.error('Token autocomplete error:', error);
                    if (requestNumber === autocompleteRequest) {
                        box.innerHTML = '<div class="suggestion-item" style="color:#888;cursor:default;">Error loading tokens</div>';
                    }
                });

        } catch (error) {
            console.error('Token autocomplete error:', error);
            if (requestNumber === autocompleteRequest) {
                box.innerHTML = '';
            }
        }
    }, 250);
}

// ============================================================
// FORMAT SUGGESTION HTML - WITH FULL ATTRIBUTES
// ============================================================

function formatSuggestionHTML(card) {
    var name = card.name || '';
    var typeLine = card.type_line || '';
    var power = card.power || '';
    var toughness = card.toughness || '';
    var oracleText = card.oracle_text || '';
    var manaCost = card.mana_cost || '';
    
    var html = '';
    
    // Token name with mana cost if present
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-weight:bold;font-size:1.05rem;">' + name + '</span>';
    if (manaCost) {
        html += '<span style="color:#f59e0b;font-size:0.8rem;">' + manaCost + '</span>';
    }
    html += '</div>';
    
    // Type line with color coding
    var typeDisplay = typeLine.replace(/Token/g, '').trim();
    if (typeDisplay) {
        var typeColor = '#888';
        if (typeDisplay.indexOf('Creature') !== -1) typeColor = '#4CAF50';
        if (typeDisplay.indexOf('Artifact') !== -1) typeColor = '#FF9800';
        if (typeDisplay.indexOf('Enchantment') !== -1) typeColor = '#9C27B0';
        if (typeDisplay.indexOf('Land') !== -1) typeColor = '#795548';
        if (typeDisplay.indexOf('Instant') !== -1 || typeDisplay.indexOf('Sorcery') !== -1) typeColor = '#F44336';
        
        html += '<div style="color:' + typeColor + ';font-size:0.8rem;margin:2px 0;">' + typeDisplay + '</div>';
    }
    
    // P/T with big emphasis
    if (power && toughness) {
        html += '<div style="color:#f59e0b;font-weight:bold;font-size:1.2rem;margin:2px 0;">' + power + '/' + toughness + '</div>';
    }
    
    // Attributes/Abilities
    if (oracleText) {
        var keywords = extractKeywords(oracleText);
        
        if (keywords.length > 0) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin:3px 0;">';
            keywords.forEach(function(keyword) {
                html += '<span style="background:#2a2a2a;color:#4FC3F7;padding:1px 6px;border-radius:3px;font-size:0.65rem;border:1px solid #333;">' + keyword + '</span>';
            });
            html += '</div>';
        }
        
        var previewText = oracleText;
        if (previewText.length > 60) {
            previewText = previewText.substring(0, 60) + '...';
        }
        html += '<div style="color:#aaa;font-size:0.7rem;font-style:italic;margin:2px 0;line-height:1.2;">' + previewText + '</div>';
    }
    
    // Artifact indicator
    if (isArtifactToken(card)) {
        var isCreature = card.type_line && card.type_line.indexOf('Creature') !== -1;
        var icon = isCreature ? '⚙️ Artifact Creature' : '⚙️ Artifact';
        html += '<div style="color:#FF9800;font-size:0.65rem;margin-top:2px;">' + icon + '</div>';
    }
    
    return html;
}

// ============================================================
// EXTRACT KEYWORDS FROM ORACLE TEXT
// ============================================================

function extractKeywords(text) {
    if (!text) return [];
    
    var keywordList = [
        'Flying', 'First Strike', 'Double Strike', 'Deathtouch', 
        'Haste', 'Hexproof', 'Indestructible', 'Lifelink', 
        'Menace', 'Reach', 'Trample', 'Vigilance', 
        'Defender', 'Flash', 'Ward', 'Protection',
        'Skulk', 'Prowess', 'Enchant', 'Equip',
        'Crew', 'Surveil', 'Dredge',
        'Escape', 'Companion', 'Mutate', 'Partner',
        'Undying', 'Persist', 'Unleash', 'Evolve'
    ];
    
    var found = [];
    var textUpper = text.toUpperCase();
    
    keywordList.forEach(function(keyword) {
        var regex = new RegExp('\\b' + keyword + '\\b', 'i');
        if (regex.test(text) && found.indexOf(keyword) === -1) {
            found.push(keyword);
        }
    });
    
    if (/\bwhenever\b/i.test(text)) {
        found.push('Trigger');
    }
    if (/at the beginning/i.test(text)) {
        found.push('Trigger');
    }
    if (/\bcreatures you control\b/i.test(text)) {
        found.push('Anthem');
    }
    if (/\bsacrifice\b/i.test(text)) {
        found.push('Sacrifice');
    }
    if (/\btap\b/i.test(text) && !/\buntap\b/i.test(text)) {
        found.push('Tap');
    }
    
    return found.slice(0, 6);
}

// ============================================================
// SELECT TOKEN FROM SUGGESTION
// ============================================================

function selectToken(card) {
    var input = document.getElementById('token-name');
    var box = document.getElementById('autocomplete-box');
    var powInput = document.getElementById('token-pow');
    var touInput = document.getElementById('token-tou');

    if (input) {
        input.value = card.name;
    }

    if (card.power && card.toughness) {
        if (powInput) {
            powInput.value = card.power;
        }
        if (touInput) {
            touInput.value = card.toughness;
        }
    } else {
        if (powInput) {
            powInput.value = '';
        }
        if (touInput) {
            touInput.value = '';
        }
    }

    window._selectedTokenCard = card;

    if (box) {
        box.innerHTML = '';
    }
    
    var form = document.getElementById('token-form');
    if (form) {
        form.dispatchEvent(new Event('submit'));
    }
}

// ============================================================
// FIND TOKEN
// ============================================================

function findToken(tokenName) {
    var name = tokenName.trim();

    if (!name) {
        return Promise.resolve(null);
    }

    return new Promise(function(resolve) {
        var searchQuery = '!"' + name + '" t:token';
        var url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(searchQuery);

        fetch(url)
            .then(function(response) {
                if (response.ok) {
                    return response.json();
                }
                return null;
            })
            .then(function(data) {
                if (data && Array.isArray(data.data)) {
                    var token = data.data.find(function(card) {
                        return isSingleFacedToken(card);
                    });

                    if (token) {
                        resolve(token);
                        return;
                    }
                }

                var fuzzyQuery = name + ' t:token';
                var fuzzyUrl = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(fuzzyQuery);

                return fetch(fuzzyUrl);
            })
            .then(function(response) {
                if (!response) {
                    resolve(null);
                    return;
                }
                if (response.ok) {
                    return response.json();
                }
                return null;
            })
            .then(function(data) {
                if (data && Array.isArray(data.data)) {
                    var token = data.data.find(function(card) {
                        return isSingleFacedToken(card);
                    });

                    if (token) {
                        resolve(token);
                        return;
                    }
                }

                resolve(null);
            })
            .catch(function(error) {
                console.warn('Token lookup failed:', error);
                resolve(null);
            });
    });
}

// ============================================================
// CARD RULES
// ============================================================

function getCardRules(card) {
    if (!card) {
        return '';
    }

    return card.oracle_text || '';
}

// ============================================================
// CARD POWER
// ============================================================

function getCardPower(card) {
    if (!card) {
        return null;
    }

    if (card.power !== undefined && card.power !== null) {
        return card.power;
    }

    return null;
}

// ============================================================
// CARD TOUGHNESS
// ============================================================

function getCardToughness(card) {
    if (!card) {
        return null;
    }

    if (card.toughness !== undefined && card.toughness !== null) {
        return card.toughness;
    }

    return null;
}

// ============================================================
// CREATE TOKENS
// ============================================================

function handleNewToken(event) {
    event.preventDefault();

    var nameInput = document.getElementById('token-name');
    var powInput = document.getElementById('token-pow');
    var touInput = document.getElementById('token-tou');
    var qtyInput = document.getElementById('token-qty-input');
    var colorInput = document.getElementById('token-color');
    var autocompleteBox = document.getElementById('autocomplete-box');

    if (!nameInput || !powInput || !touInput || !qtyInput || !colorInput) {
        console.error('Token form elements are missing.');
        return;
    }

    var name = nameInput.value.trim();

    if (!name) {
        return;
    }

    var quantity = parseInt(qtyInput.value, 10);

    if (!isFinite(quantity) || quantity < 1) {
        quantity = 1;
    }

    quantity = Math.min(quantity, 100);

    if (autocompleteBox) {
        autocompleteBox.innerHTML = '';
    }

    var imageUrl = '';
    var rulesText = '';
    var power = powInput.value.trim() || '1';
    var toughness = touInput.value.trim() || '1';
    var isArtifact = false;
    var isArtifactCreature = false;

    var selectedCard = window._selectedTokenCard || null;
    
    if (selectedCard && selectedCard.name === name) {
        processTokenCard(selectedCard, function(card) {
            createTokensFromCard(card, name, quantity, colorInput, powInput, touInput, autocompleteBox);
        });
    } else {
        findToken(name)
            .then(function(card) {
                processTokenCard(card, function(processedCard) {
                    createTokensFromCard(processedCard, name, quantity, colorInput, powInput, touInput, autocompleteBox);
                });
            })
            .catch(function(error) {
                console.error('Scryfall token lookup failed:', error);
                createTokensFromCard(null, name, quantity, colorInput, powInput, touInput, autocompleteBox);
            });
    }
}

// ============================================================
// PROCESS TOKEN CARD
// ============================================================

function processTokenCard(card, callback) {
    if (card) {
        callback(card);
    } else {
        callback(null);
    }
}

// ============================================================
// CREATE TOKENS FROM CARD
// ============================================================

function createTokensFromCard(card, name, quantity, colorInput, powInput, touInput, autocompleteBox) {
    var imageUrl = '';
    var rulesText = '';
    var power = powInput.value.trim() || '1';
    var toughness = touInput.value.trim() || '1';
    var isArtifact = false;
    var isArtifactCreature = false;

    if (card) {
        imageUrl = getCardImage(card);
        rulesText = getCardRules(card);
        isArtifact = isArtifactToken(card);
        isArtifactCreature = isArtifactCreatureToken(card);

        // iOS 9 fix: Try to load image and fallback if needed
        if (imageUrl && isIOS9()) {
            // For iOS 9, we'll use a simpler approach - just store the URL
            // and let the CSS handle it with a fallback
            console.log('iOS 9 detected, using image URL directly');
        }

        if (!isArtifact || isArtifactCreature) {
            var scryfallPower = getCardPower(card);
            var scryfallToughness = getCardToughness(card);

            if (scryfallPower !== null && scryfallPower !== undefined) {
                power = String(scryfallPower);
                if (powInput) powInput.value = power;
            }

            if (scryfallToughness !== null && scryfallToughness !== undefined) {
                toughness = String(scryfallToughness);
                if (touInput) touInput.value = toughness;
            }
        } else {
            power = '';
            toughness = '';
            if (powInput) powInput.value = '';
            if (touInput) touInput.value = '';
        }
    }

    for (var i = 0; i < quantity; i++) {
        state.tokens.push({
            id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2),
            name: name,
            pow: power,
            tou: toughness,
            color: colorInput.value,
            counters: 0,
            tapped: false,
            artUrl: imageUrl,
            rules: rulesText,
            isArtifact: isArtifact,
            isArtifactCreature: isArtifactCreature
        });
    }

    var nameInput = document.getElementById('token-name');
    if (nameInput) nameInput.value = '';
    if (powInput) powInput.value = '1';
    if (touInput) touInput.value = '1';
    if (document.getElementById('token-qty-input')) document.getElementById('token-qty-input').value = '1';
    if (colorInput) colorInput.value = 'M';
    if (autocompleteBox) autocompleteBox.innerHTML = '';
    
    window._selectedTokenCard = null;

    saveToStorage();
    render();
}

// ============================================================
// TOKEN COUNTERS
// ============================================================

function adjustCounters(id, amount) {
    var token = state.tokens.find(function(token) {
        return token.id === id;
    });

    if (!token) {
        return;
    }

    token.counters += amount;

    saveToStorage();
    render();
}

// ============================================================
// TAP / UNTAP
// ============================================================

function toggleTap(id) {
    var token = state.tokens.find(function(token) {
        return token.id === id;
    });

    if (!token) {
        return;
    }

    token.tapped = !token.tapped;

    saveToStorage();
    render();
}

// ============================================================
// DELETE TOKEN
// ============================================================

function deleteToken(id) {
    state.tokens = state.tokens.filter(function(token) {
        return token.id !== id;
    });

    saveToStorage();
    render();
}

// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// DISPLAY P/T
// ============================================================

function getDisplayedStat(baseValue, counters) {
    var value = String(baseValue || '');

    if (/^-?\d+$/.test(value)) {
        return Number(value) + counters;
    }

    return value;
}

// ============================================================
// SHOULD SHOW P/T
// ============================================================

function shouldShowPT(token) {
    return !token.isArtifact || token.isArtifactCreature;
}

// ============================================================
// RENDER
// ============================================================

function render() {
    var lifeDisplay = document.getElementById('life-display');
    var grid = document.getElementById('token-grid');

    if (lifeDisplay) {
        lifeDisplay.textContent = state.lifeTotal;
    }

    if (!grid) {
        return;
    }

    grid.innerHTML = '';

    state.tokens.forEach(function(token) {
        var wrapper = document.createElement('div');
        wrapper.className = 'token-wrapper';
        
        var card = document.createElement('div');

        var tappedClass = token.tapped ? 'tapped' : '';

        if (token.artUrl) {
            card.className = 'token-card has-art ' + tappedClass;
            // iOS 9 fix: Use image with cache busting
            var imgUrl = token.artUrl;
            // Add a cache buster to prevent iOS 9 from caching broken images
            if (isIOS9()) {
                imgUrl = imgUrl + '?v=' + Date.now();
            }
            card.style.backgroundImage = 'url(' + JSON.stringify(imgUrl) + ')';
        } else {
            card.className = 'token-card clr-' + token.color + ' ' + tappedClass;
            card.style.backgroundImage = 'none';
        }

        var ptDisplay = '';

        if (shouldShowPT(token)) {
            var power = getDisplayedStat(token.pow, token.counters);
            var toughness = getDisplayedStat(token.tou, token.counters);

            if (power !== '' && toughness !== '') {
                ptDisplay = '<div class="token-pt">' + escapeHtml(power) + '/' + escapeHtml(toughness) + '</div>';
            }
        }

        var artifactBadge = '';
        if (token.isArtifact && !token.isArtifactCreature) {
            artifactBadge = '<div class="artifact-badge">⚙️ Artifact</div>';
        }

        card.innerHTML = 
            '<div class="token-header">' +
                '<span class="token-title">' + escapeHtml(token.name) + '</span>' +
                '<button type="button" class="btn-delete" data-action="delete" data-id="' + escapeHtml(token.id) + '" aria-label="Delete token">' +
                    '✕' +
                '</button>' +
            '</div>' +
            ptDisplay +
            artifactBadge +
            '<div class="token-rules">' + escapeHtml(token.rules || '') + '</div>' +
            '<div class="counter-badge">' + token.counters + ' Counters</div>' +
            '<div class="token-controls">' +
                '<button type="button" class="btn-sm" data-action="counter-down" data-id="' + escapeHtml(token.id) + '">-1</button>' +
                '<button type="button" class="btn-sm" data-action="counter-up" data-id="' + escapeHtml(token.id) + '">+1</button>' +
            '</div>' +
            '<button type="button" class="btn-tap" data-action="tap" data-id="' + escapeHtml(token.id) + '">' +
                (token.tapped ? 'UNTAP' : 'TAP') +
            '</button>';

        wrapper.appendChild(card);
        grid.appendChild(wrapper);
    });
}

// ============================================================
// TOKEN BUTTON EVENTS
// ============================================================

function handleTokenGridClick(event) {
    var button = event.target.closest('button[data-action]');

    if (!button) {
        return;
    }

    var action = button.dataset.action;
    var id = button.dataset.id;

    if (!id) {
        return;
    }

    switch (action) {
        case 'delete':
            deleteToken(id);
            break;
        case 'counter-down':
            adjustCounters(id, -1);
            break;
        case 'counter-up':
            adjustCounters(id, 1);
            break;
        case 'tap':
            toggleTap(id);
            break;
    }
}

// ============================================================
// CLOSE AUTOCOMPLETE
// ============================================================

function handleDocumentClick(event) {
    var input = document.getElementById('token-name');
    var box = document.getElementById('autocomplete-box');

    if (!input || !box) {
        return;
    }

    if (event.target === input || box.contains(event.target)) {
        return;
    }

    box.innerHTML = '';
    window._selectedTokenCard = null;
}

// ============================================================
// ESC KEY
// ============================================================

function handleNameKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }

    var box = document.getElementById('autocomplete-box');

    if (box) {
        box.innerHTML = '';
        window._selectedTokenCard = null;
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

function initializeApp() {
    var grid = document.getElementById('token-grid');
    var nameInput = document.getElementById('token-name');

    if (grid) {
        grid.addEventListener('click', handleTokenGridClick);
    }

    if (nameInput) {
        nameInput.addEventListener('keydown', handleNameKeydown);
    }

    document.addEventListener('click', handleDocumentClick);

    render();
}

// ============================================================
// START APP
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}