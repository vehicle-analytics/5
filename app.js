/**
 * 🚗 Аналітична панель відстеження запчастин
 * Версія 2.3 - Виправлене форматування кілометражу
 */

class CarAnalyticsApp {
    constructor() {
        this.appData = null;
        this.cachedData = null;
        this.state = {
            searchTerm: '',
            selectedCity: 'Всі міста',
            selectedCar: null,
            selectedStatus: 'all',
            selectedPartFilter: null,
            selectedHistoryPartFilter: null,
            historySearchTerm: '',
            currentView: 'list'
        };
        
        this.searchTimeout = null;
        this.historySearchTimeout = null;
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Ініціалізація аналітичної панелі...');
        
        this.updateLoadingProgress(10);
        this.setupEventListeners();
        this.updateLoadingProgress(20);
        await this.loadData();
        this.updateLoadingProgress(100);
        
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('main-interface').classList.remove('hidden');
            this.render();
        }, 500);
        
        this.startAutoRefresh();
    }
    
    // Функція для конвертації числа в тисячі (якщо потрібно)
    convertToThousands(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        
        // Якщо число менше 1000, можливо воно вже в тисячах
        if (value < 1000 && value > 100) {
            // Може бути 352 (означає 352 000)
            return value * 1000;
        }
        
        // Якщо число більше 1000000, можливо воно вже в одиницях
        if (value > 1000000) {
            return value;
        }
        
        // Якщо число між 1000 і 100000, можливо воно в тисячах
        if (value >= 1000 && value <= 100000) {
            return value * 1000;
        }
        
        // Для всіх інших випадків залишаємо як є
        return value;
    }
    
    // Функція для форматування чисел з пробілами
    formatNumber(number) {
        if (number === null || number === undefined || isNaN(number)) {
            return '-';
        }
        
        // Округлення до цілого числа
        const roundedNumber = Math.round(number);
        
        // Форматування з пробілами тисяч
        return roundedNumber.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    
    // Функція для форматування пробігу (з "км")
    formatMileage(mileage) {
        if (mileage === null || mileage === undefined || isNaN(mileage)) {
            return '- км';
        }
        
        // Конвертуємо в тисячі, якщо потрібно
        const convertedMileage = this.convertToThousands(mileage);
        const formatted = this.formatNumber(convertedMileage);
        return `${formatted} км`;
    }
    
    // Функція для отримання оригінального значення пробігу
    getOriginalMileage(mileage) {
        if (mileage === null || mileage === undefined || isNaN(mileage)) {
            return 0;
        }
        return this.convertToThousands(mileage);
    }
    
    // Функція для форматування різниці пробігу
    formatMileageDiff(mileageDiff) {
        if (mileageDiff === null || mileageDiff === undefined || isNaN(mileageDiff)) {
            return '- км';
        }
        
        const formatted = this.formatNumber(mileageDiff);
        return `${formatted} км`;
    }
    
    // Функція для форматування цін
    formatPrice(price) {
        if (price === null || price === undefined || isNaN(price) || price === 0) {
            return '';
        }
        
        // Округлення до 2 знаків після коми для цін
        const roundedPrice = Math.round(price * 100) / 100;
        return roundedPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    
    async loadData() {
        console.log('📥 Завантаження даних...');
        
        try {
            const cached = this.getCachedData();
            if (cached) {
                console.log('✅ Використано кешовані дані');
                this.appData = cached;
                this.updateCacheInfo();
                return;
            }
            
            await this.fetchDataFromSheets();
            
        } catch (error) {
            console.error('❌ Помилка завантаження даних:', error);
            this.showError(`Помилка завантаження: ${error.message}`);
        }
    }
    
    async fetchDataFromSheets() {
        const config = window.CONFIG;
        const { SPREADSHEET_ID, SHEETS, API_KEY } = config;
        
        console.log('📋 Завантаження даних з Google Sheets...');
        
        const [scheduleData, historyData] = await Promise.all([
            this.fetchSheetData(SPREADSHEET_ID, SHEETS.SCHEDULE, API_KEY),
            this.fetchSheetData(SPREADSHEET_ID, SHEETS.HISTORY, API_KEY)
        ]);
        
        console.log('✅ Дані отримано:', {
            scheduleRows: scheduleData?.length || 0,
            historyRows: historyData?.length || 0
        });
        
        this.processData(scheduleData, historyData);
        this.cacheData(this.appData);
        console.log('✅ Дані успішно оброблено');
        this.updateCacheInfo();
    }
    
    async fetchSheetData(spreadsheetId, sheetName, apiKey) {
        try {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
            console.log(`📥 Запит до: ${sheetName}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data.values || [];
        } catch (error) {
            console.error(`❌ Помилка завантаження аркуша ${sheetName}:`, error);
            return [];
        }
    }
    
    processData(scheduleData, historyData) {
        console.log('🔧 Обробка даних...');
        
        if (!scheduleData || !historyData) {
            throw new Error('Немає даних для обробки');
        }
        
        const carsInfo = {};
        const carCities = {};
        
        // Обробка графіку обслуговування
        for (let i = 1; i < scheduleData.length; i++) {
            const row = scheduleData[i];
            
            if (row.length < 5) {
                console.warn(`Рядок ${i} має недостатньо колонок:`, row);
                continue;
            }
            
            const license = String(row[CONSTANTS.SCHEDULE_COL_LICENSE] || '').trim();
            
            if (license) {
                const city = String(row[CONSTANTS.SCHEDULE_COL_CITY] || '').trim();
                carsInfo[license] = {
                    city: city,
                    license: license,
                    model: String(row[CONSTANTS.SCHEDULE_COL_MODEL] || '').trim(),
                    year: String(row[CONSTANTS.SCHEDULE_COL_YEAR] || '').trim()
                };
                carCities[license] = city;
            }
        }
        
        const allowedCars = Object.keys(carsInfo);
        console.log(`🚗 Знайдено ${allowedCars.length} автомобілів`);
        
        // Обробка історичних даних
        const records = [];
        const currentMileages = {};
        const allowedCarsSet = new Set(allowedCars);
        
        for (let i = 1; i < historyData.length; i++) {
            const row = historyData[i];
            
            if (row.length < 8) {
                console.warn(`Рядок історії ${i} має недостатньо колонок:`, row);
                continue;
            }
            
            const car = String(row[CONSTANTS.COL_CAR] || '').trim();
            
            if (!car || !allowedCarsSet.has(car)) {
                continue;
            }
            
            const mileageStr = String(row[CONSTANTS.COL_MILEAGE] || '').trim();
            let mileage = 0;
            
            // Обробка різних форматів пробігу
            if (mileageStr) {
                // Видаляємо всі пробіли та коми
                const cleanStr = mileageStr.replace(/[\s,]/g, '');
                
                // Спробуємо розпарсити число
                mileage = parseFloat(cleanStr);
                
                if (isNaN(mileage)) {
                    console.warn(`Некоректний пробіг для авто ${car}: ${mileageStr}`);
                    continue;
                }
                
                // Конвертуємо в тисячі, якщо потрібно
                mileage = this.convertToThousands(mileage);
            }
            
            if (mileage === 0) continue;
            
            let date = row[CONSTANTS.COL_DATE];
            if (date) {
                const dateObj = this.parseDate(date);
                if (dateObj) {
                    date = dateObj.toISOString().split('T')[0];
                } else {
                    date = String(date).trim();
                }
            }
            
            const city = carCities[car] || '';
            
            records.push({
                date: date || '',
                city: city,
                car: car,
                mileage: mileage,
                originalMileage: mileageStr, // Зберігаємо оригінальне значення для дебагу
                description: String(row[CONSTANTS.COL_DESCRIPTION] || ''),
                partCode: row.length > CONSTANTS.COL_PART_CODE ? String(row[CONSTANTS.COL_PART_CODE] || '').trim() : '',
                unit: row.length > CONSTANTS.COL_UNIT ? String(row[CONSTANTS.COL_UNIT] || '').trim() : '',
                quantity: row.length > CONSTANTS.COL_QUANTITY ? parseFloat(row[CONSTANTS.COL_QUANTITY]) || 0 : 0,
                price: row.length > CONSTANTS.COL_PRICE ? parseFloat(row[CONSTANTS.COL_PRICE]) || 0 : 0,
                totalWithVAT: row.length > CONSTANTS.COL_TOTAL_WITH_VAT ? parseFloat(row[CONSTANTS.COL_TOTAL_WITH_VAT]) || 0 : 0,
                status: row.length > CONSTANTS.COL_STATUS ? String(row[CONSTANTS.COL_STATUS] || '').trim() : ''
            });
            
            // Оновлення максимального пробігу
            if (mileage > (currentMileages[car] || 0)) {
                currentMileages[car] = mileage;
            }
        }
        
        console.log(`📊 Оброблено ${records.length} записів історії`);
        
        // Додамо логування для перевірки пробігів
        if (records.length > 0) {
            console.log('Приклади пробігів з історії:');
            records.slice(0, 3).forEach((record, i) => {
                console.log(`  ${i+1}. ${record.car}: ${record.originalMileage} -> ${record.mileage} км`);
            });
        }
        
        this.appData = {
            records: records,
            currentMileages: currentMileages,
            carsInfo: carsInfo,
            partKeywords: CONSTANTS.PARTS_CONFIG,
            partsOrder: CONSTANTS.PARTS_ORDER,
            currentDate: new Date().toISOString().split('T')[0],
            lastUpdated: new Date().toISOString(),
            _meta: {
                totalCars: allowedCars.length,
                totalRecords: records.length,
                processingTime: Date.now()
            }
        };
        
        document.getElementById('cars-count').textContent = allowedCars.length;
    }
    
    // Основний рендеринг
    render() {
        if (!this.appData) {
            this.showError('Дані не завантажено');
            return;
        }
        
        if (this.appData._meta.totalCars === 0) {
            this.renderNoData();
            return;
        }
        
        if (this.state.selectedCar) {
            this.renderCarDetail();
        } else {
            this.renderCarList();
        }
    }
    
    renderCarList() {
        const data = this.processCarData();
        const filteredData = this.filterCars(data);
        const cities = this.getCities(data);
        const stats = this.calculateStats(data);
        
        const html = this.generateCarListHTML(data, filteredData, cities, stats);
        document.getElementById('main-interface').innerHTML = html;
    }
    
    renderCarDetail() {
        const data = this.processCarData();
        const car = data.find(c => c.car === this.state.selectedCar);
        
        if (!car) {
            this.state.selectedCar = null;
            this.render();
            return;
        }
        
        const html = this.generateCarDetailHTML(car);
        document.getElementById('main-interface').innerHTML = html;
    }
    
    // Генерація HTML
    generateCarListHTML(allCars, filteredCars, cities, stats) {
        const importantParts = CONSTANTS.PARTS_ORDER.slice(0, 7);
        
        return `
            <div class="min-h-screen">
                <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-b-xl shadow-xl p-4">
                    <div class="max-w-[1600px] mx-auto">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h1 class="text-2xl sm:text-3xl font-bold text-white mb-1">🚗 Список автомобілів</h1>
                                <p class="text-blue-100 text-sm">Натисніть на рядок для перегляду деталей</p>
                            </div>
                            <div class="text-right">
                                <div class="text-blue-100 text-xs">Дата оновлення</div>
                                <div class="text-white text-lg font-bold">${this.appData.currentDate}</div>
                                <div class="text-blue-200 text-xs">${allCars.length} авто • ${this.appData._meta.totalRecords} записів</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="max-w-[1600px] mx-auto p-3 sm:p-4">
                    <!-- Статистика -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        ${this.generateStatsCards(stats)}
                    </div>

                    <!-- Фільтри -->
                    <div class="bg-white rounded-xl shadow-lg p-4 mb-4">
                        ${this.generateFiltersHTML(cities)}
                    </div>

                    <!-- Таблиця -->
                    <div class="bg-white rounded-xl shadow-xl overflow-hidden">
                        ${this.generateCarsTable(filteredCars, importantParts)}
                    </div>

                    <!-- Легенда -->
                    <div class="mt-4 bg-white rounded-xl shadow-lg p-4">
                        <h3 class="font-bold text-gray-800 mb-2 text-sm">📊 Легенда</h3>
                        <div class="flex flex-wrap gap-4 text-xs">
                            <div class="flex items-center gap-2"><div class="w-4 h-4 bg-green-500 rounded-full"></div><span>Норма</span></div>
                            <div class="flex items-center gap-2"><div class="w-4 h-4 bg-orange-500 rounded-full"></div><span>Увага</span></div>
                            <div class="flex items-center gap-2"><div class="w-4 h-4 bg-red-500 rounded-full"></div><span>Критично</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    generateCarsTable(cars, importantParts) {
        if (cars.length === 0) {
            return `
                <div class="px-4 py-12 text-center">
                    <div class="text-gray-400 text-lg mb-2">🚫</div>
                    <div class="text-gray-600 font-medium">Автомобілів не знайдено</div>
                    <div class="text-gray-400 text-sm mt-1">Спробуйте змінити параметри пошуку</div>
                </div>
            `;
        }
        
        const tableHeaders = this.generateTableHeaders(importantParts);
        const tableRows = cars.map((car, idx) => this.generateCarRow(car, idx, importantParts)).join('');
        
        return `
            <div class="overflow-x-auto">
                <table class="w-full min-w-[1000px]">
                    <thead class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Статус</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Номер</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase mobile-hidden">Модель</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase mobile-hidden">Рік</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Місто</th>
                            <th class="px-3 py-3 text-left text-xs font-bold uppercase">Пробіг</th>
                            ${tableHeaders}
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase mobile-hidden">✅</th>
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase mobile-hidden">⚠️</th>
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase mobile-hidden">⛔</th>
                            <th class="px-3 py-3 text-center text-xs font-bold uppercase">📋</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    generateCarRow(car, idx, importantParts) {
        const parts = Object.values(car.parts).filter(p => p !== null);
        const criticalCount = parts.filter(p => p.status === 'critical').length;
        const warningCount = parts.filter(p => p.status === 'warning').length;
        const goodCount = parts.filter(p => p.status === 'good').length;
        
        const statusColor = criticalCount > 0 ? 'bg-red-500' : warningCount > 0 ? 'bg-orange-500' : 'bg-green-500';
        const rowBg = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';
        
        const partCells = importantParts.map(partName => {
            const part = car.parts[partName];
            const isMonths = partName.includes('Діагностика') || partName.includes('Розвал') || partName.includes('Профілактика');
            const display = this.getPartDisplay(part, isMonths);
            return `<td class="px-2 py-3 text-center"><div class="${display.bg} ${display.color} font-semibold text-xs py-1 px-2 rounded whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">${display.text}</div></td>`;
        }).join('');
        
        return `
            <tr class="${rowBg} hover:bg-blue-50 cursor-pointer transition-colors" 
                onclick="app.setState({ selectedCar: '${car.car}' }); app.render();">
                <td class="px-3 py-3"><div class="${statusColor} w-3 h-3 rounded-full"></div></td>
                <td class="px-3 py-3">
                    <div class="font-bold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]" 
                         title="${car.license}">${car.license}</div>
                </td>
                <td class="px-3 py-3 mobile-hidden">
                    <div class="text-gray-700 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" 
                         title="${car.model}">${car.model}</div>
                </td>
                <td class="px-3 py-3 mobile-hidden">
                    <div class="text-gray-600 text-sm whitespace-nowrap">${car.year || '-'}</div>
                </td>
                <td class="px-3 py-3">
                    <div class="text-gray-600 text-sm whitespace-nowrap flex items-center gap-1">
                        <span>📍</span>
                        <span>${car.city || '-'}</span>
                    </div>
                </td>
                <td class="px-3 py-3">
                    <div class="font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                        ${this.formatMileage(car.currentMileage)}
                    </div>
                </td>
                ${partCells}
                <td class="px-3 py-3 text-center mobile-hidden">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm">
                        ${goodCount}
                    </span>
                </td>
                <td class="px-3 py-3 text-center mobile-hidden">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
                        ${warningCount}
                    </span>
                </td>
                <td class="px-3 py-3 text-center mobile-hidden">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-sm">
                        ${criticalCount}
                    </span>
                </td>
                <td class="px-3 py-3 text-center">
                    <div class="text-blue-600 font-semibold text-sm whitespace-nowrap">
                        ${car.history.length}
                    </div>
                </td>
            </tr>
        `;
    }
    
    getPartDisplay(part, isMonths = false) {
        if (!part) return { color: 'text-gray-400', text: '-', bg: 'bg-gray-100' };
        
        let color = 'text-green-600', bg = 'bg-green-100';
        if (part.status === 'warning') { color = 'text-orange-600'; bg = 'bg-orange-100'; }
        else if (part.status === 'critical') { color = 'text-red-600'; bg = 'bg-red-100'; }
        
        // ФОРМАТУВАННЯ З ПРОБІЛАМИ ДЛЯ КІЛОМЕТРАЖУ
        const text = isMonths ? 
            Math.floor(part.daysDiff / 30) + 'міс' : 
            this.formatMileageDiff(part.mileageDiff);
            
        return { color, text, bg };
    }
    
    // Детальний перегляд автомобіля
    generateCarDetailHTML(car) {
        const { selectedHistoryPartFilter, historySearchTerm } = this.state;
        const displayHistory = this.filterCarHistory(car.history, selectedHistoryPartFilter, historySearchTerm);
        const partNames = CONSTANTS.PARTS_ORDER;
        
        return `
            <div class="min-h-screen">
                <div class="mb-4 sm:mb-6">
                    <button onclick="app.setState({ selectedCar: null, selectedHistoryPartFilter: null, historySearchTerm: '' });" 
                            class="bg-white hover:bg-gray-100 text-blue-600 font-semibold px-4 py-2 rounded-lg shadow-lg transition-all flex items-center gap-2 mb-3">
                        ← Назад до списку
                    </button>
                    <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-2xl p-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div class="flex items-center gap-3">
                                <div class="bg-white/20 p-3 rounded-xl text-3xl">🚗</div>
                                <div>
                                    <div class="text-white text-xl font-bold">${car.license}</div>
                                    <div class="text-blue-100 text-base">${car.model || 'Немає моделі'}</div>
                                    <div class="text-blue-200 text-xs mt-1">
                                        ${car.year ? car.year + ' рік' : ''} 
                                        ${car.year && car.city ? ' • ' : ''}
                                        ${car.city || ''}
                                    </div>
                                </div>
                            </div>
                            <div class="text-left sm:text-right">
                                <div class="text-blue-100 text-xs">Поточний пробіг</div>
                                <div class="text-white text-xl font-bold">${this.formatMileage(car.currentMileage)}</div>
                                <div class="text-blue-200 text-xs mt-1">📋 ${car.history.length} записів в історії</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="max-w-[1400px] mx-auto p-4">
                    <!-- Стан запчастин -->
                    <div class="bg-white rounded-xl shadow-xl p-3 mb-4">
                        ${this.generateCarPartsHTML(car, partNames)}
                    </div>
                    
                    <!-- Історія обслуговування -->
                    <div class="bg-white rounded-xl shadow-xl p-3">
                        ${this.generateCarHistoryHTML(car, displayHistory)}
                    </div>
                </div>
            </div>
        `;
    }
    
    generateCarPartsHTML(car, partNames) {
        const importantParts = partNames.slice(0, 8);
        const otherParts = partNames.slice(8);
        
        return `
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>🔧</span> Стан запчастин
                ${this.state.selectedHistoryPartFilter || this.state.historySearchTerm ? `
                    <button onclick="app.setState({ selectedHistoryPartFilter: null, historySearchTerm: '' });" 
                            class="ml-auto bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold transition-colors">
                        ✕ Скинути всі фільтри
                    </button>
                ` : ''}
            </h3>
            
            <div class="mb-4">
                <h4 class="text-base font-semibold text-blue-600 mb-2">⚡ Важливі категорії</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    ${importantParts.map(partName => this.generatePartCard(car, partName)).join('')}
                </div>
            </div>
            
            <div>
                <h4 class="text-base font-semibold text-gray-600 mb-2">🔩 Інші запчастини</h4>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    ${otherParts.map(partName => this.generatePartCard(car, partName, true)).join('')}
                </div>
            </div>
        `;
    }
    
    generatePartCard(car, partName, small = false) {
        const part = car.parts[partName];
        const isActive = this.state.selectedHistoryPartFilter === partName;
        
        let borderClass = !part ? 'border-gray-200' : 
                         part.status === 'critical' ? 'border-red-300' : 
                         part.status === 'warning' ? 'border-orange-300' : 'border-green-300';
        
        let bgClass = !part ? 'bg-gray-50' : 
                     part.status === 'critical' ? 'bg-red-50' : 
                     part.status === 'warning' ? 'bg-orange-50' : 'bg-green-50';
        
        let textClass = !part ? 'text-gray-400' : 
                       part.status === 'critical' ? 'text-red-600' : 
                       part.status === 'warning' ? 'text-orange-600' : 'text-green-600';
        
        const activeClass = isActive ? 'border-2 border-blue-500 ring-2 ring-blue-200' : '';
        const formattedDate = part ? this.formatDate(part.date) : '';
        
        const cardClass = small ? 'p-2 rounded border' : 'p-3 rounded-lg border';
        const textSize = small ? 'text-xs' : 'text-sm';
        
        return `
            <div class="${cardClass} ${borderClass} ${bgClass} cursor-pointer hover:shadow transition-all ${activeClass}" 
                 onclick="app.setState({ selectedHistoryPartFilter: app.state.selectedHistoryPartFilter === '${partName}' ? null : '${partName}' });">
                <div class="font-bold text-gray-800 ${textSize} mb-1 flex items-center justify-between">
                    <span class="truncate" title="${partName}">${partName}</span>
                    ${isActive ? '<span class="text-blue-500 text-xs flex-shrink-0 ml-1">🔍</span>' : ''}
                </div>
                ${part ? `
                    <div class="${small ? 'space-y-0.5' : 'space-y-1'}">
                        <div class="flex justify-between items-center">
                            <div class="text-xs text-gray-500">Дата:</div>
                            <div class="font-semibold text-gray-800 text-xs">${formattedDate}</div>
                        </div>
                        <div class="text-center">
                            <div class="${small ? 'text-sm' : 'text-lg'} font-bold ${textClass}">
                                <!-- ВИКОРИСТАННЯ ФОРМАТУВАННЯ З ПРОБІЛАМИ -->
                                ${this.formatMileageDiff(part.mileageDiff)}
                            </div>
                        </div>
                        <div class="flex justify-between items-center">
                            <div class="text-xs text-gray-500">Час:</div>
                            <div class="text-xs text-gray-600">${part.timeDiff}</div>
                        </div>
                    </div>
                ` : '<div class="text-gray-300 text-xs text-center py-2">Немає даних</div>'}
            </div>
        `;
    }
    
    generateHistoryRecordHTML(record) {
        const formattedDate = this.formatDate(record.date);
        
        // ФОРМАТУВАННЯ ЧИСЕЛ З ПРОБІЛАМИ
        const formattedMileage = this.formatMileage(record.mileage);
        const formattedQuantity = record.quantity ? this.formatNumber(record.quantity) : '';
        const formattedPrice = record.price ? this.formatPrice(record.price) + ' ₴' : '';
        const formattedTotal = record.totalWithVAT ? this.formatPrice(record.totalWithVAT) + ' ₴' : '';
        
        // Визначення стилю статусу
        let statusClass = 'bg-gray-100 text-gray-600';
        let statusIcon = '📄';
        if (record.status) {
            const statusLower = record.status.toLowerCase();
            if (statusLower.includes('виконано') || statusLower.includes('готово') || statusLower.includes('підтверджено')) {
                statusClass = 'bg-green-100 text-green-700';
                statusIcon = '✅';
            } else if (statusLower.includes('очікує') || statusLower.includes('в обробці') || statusLower.includes('замовлено')) {
                statusClass = 'bg-blue-100 text-blue-700';
                statusIcon = '⏳';
            } else if (statusLower.includes('відмов') || statusLower.includes('скасовано') || statusLower.includes('недоступно')) {
                statusClass = 'bg-red-100 text-red-700';
                statusIcon = '❌';
            }
        }
        
        const unitDisplay = record.unit ? record.unit : (record.quantity > 0 ? 'шт.' : '');
        
        return `
            <div class="bg-gray-50 hover:bg-gray-100 rounded-lg p-4 border border-gray-200 transition-all hover:shadow-sm">
                <!-- ДАТА ТА ПРОБІГ -->
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-base">📅</span>
                        <span class="font-bold text-gray-800 text-sm">${formattedDate}</span>
                    </div>
                    <div class="flex items-center gap-2 bg-orange-50 px-3 py-1 rounded-full">
                        <span class="text-sm">🛣️</span>
                        <span class="font-bold text-orange-700 text-sm">${formattedMileage}</span>
                    </div>
                </div>
                
                <!-- ОПИС ТА ДЕТАЛІ -->
                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div class="text-gray-700 text-sm flex-1">
                        ${record.description}
                        ${record.partCode || record.unit || record.quantity > 0 || record.price > 0 ? `
                            <div class="mt-2 flex flex-wrap gap-2 items-center">
                                ${record.partCode ? `
                                    <span class="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                        <span>🔩</span>
                                        <span class="font-medium">Код: ${record.partCode}</span>
                                    </span>
                                ` : ''}
                                ${unitDisplay ? `
                                    <span class="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                                        <span>📦</span>
                                        <span>Од.: ${unitDisplay}</span>
                                    </span>
                                ` : ''}
                                ${formattedQuantity ? `
                                    <span class="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded text-xs">
                                        <span>🔢</span>
                                        <span>Кільк.: ${formattedQuantity}</span>
                                    </span>
                                ` : ''}
                                ${formattedPrice ? `
                                    <span class="inline-flex items-center gap-1 bg-blue-100 px-2 py-1 rounded text-xs">
                                        <span>💰</span>
                                        <span class="font-semibold">Ціна: ${formattedPrice}</span>
                                    </span>
                                ` : ''}
                                ${formattedTotal ? `
                                    <span class="inline-flex items-center gap-1 bg-green-100 px-2 py-1 rounded text-xs">
                                        <span>💵</span>
                                        <span class="font-bold">Сума: ${formattedTotal}</span>
                                    </span>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${record.status ? `
                        <div class="${statusClass} px-3 py-1 rounded text-xs font-medium whitespace-nowrap mt-2 sm:mt-0 self-start">
                            ${statusIcon} ${record.status}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // Інші функції залишаються без змін...
    // ... (решта коду без змін)
}

// Глобальний об'єкт для доступу з HTML
window.app = null;

// Ініціалізація додатку при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CarAnalyticsApp();
});
