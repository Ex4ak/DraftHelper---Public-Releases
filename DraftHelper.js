/* DraftHelper 3.6.0.
 * Модули: DraftModel, ComponentValues, Engine, Journal, ReplaySession, NetworkObserver, PanelView, Controller.
 * Правила услуги проверяются только в поддерживаемых форматах.
 * Для запуска вставьте файл в консоль браузера, затем загрузите черновик через панель или DraftHelper.setDraft(draft).
 * Помощник не нажимает кнопки, не заполняет форму, не загружает файлы и не отправляет собственные запросы.
 */
(function (root) {
    'use strict';
    const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    function decode(v) {
        if (typeof v !== 'string' || !/^[\s]*[\[{]/.test(v)) return v;
        try { return JSON.parse(v); } catch { return v; }
    }
    const text = v => v === undefined ? '(значение отсутствует)' : v === null ? 'null' :
        v === '' ? '(пустая строка)' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    function date(v) {
        if (typeof v !== 'string') return text(v);
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(v);
        return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
    }
    function format(c, raw) {
        const v = decode(raw);
        if (c.type === 'DateInput') return date(v);
        if (!object(v)) return text(v);
        switch (c.type) {
            case 'MaritalStatusInput': {
                const registrar = decode(v.act_rec_registrator);
                const name = object(registrar) ? registrar.text ?? registrar.originalItem?.fullname ?? registrar.originalItem?.title ?? registrar.id ?? registrar : registrar;
                return [
                    own(v, 'act_rec_date') ? `Дата актовой записи: ${date(v.act_rec_date)}` : null,
                    own(v, 'act_rec_number') ? `Номер актовой записи: ${text(v.act_rec_number)}` : null,
                    own(v, 'act_rec_registrator') ? `Орган регистрации: ${text(name)}` : null
                ].filter(line => line !== null).join('\n') || text(v);
            }
            case 'PaymentTypeSelector': case 'UnusedPayments': case 'PaymentScr': {
                const fields = c.type === 'PaymentTypeSelector' ?
                    [['selected', 'Выбор'], ['amount', 'Сумма (как в ответе)'], ['billNumber', 'Номер счёта'], ['billId', 'ID счёта']] :
                    [['uin', 'УИН'], ['paymentPurpose', 'Назначение платежа'], ['title', 'Название платежа'],
                        ['amount', 'Сумма (как в ответе)'], ['billId', 'ID счёта'], ['invitation_address', 'Адрес'], ['link', 'Ссылка']];
                return fields.filter(([key]) => own(v, key)).map(([key, label]) => `${label}: ${text(v[key])}`).join('\n') || text(v);
            }
            case 'PoddFileUpload': {
                const lines = [];
                if (Array.isArray(v.files)) {
                    lines.push(`Файлов в ответе: ${v.files.length}`);
                    v.files.forEach((file, index) => {
                        if (!object(file)) { lines.push(`${index + 1}. ${text(file)}`); return; }
                        const flags = [];
                        if (own(file, 'hasSign')) flags.push(file.hasSign === true ? 'есть подпись' : file.hasSign === false ? 'без подписи' : `подпись: ${text(file.hasSign)}`);
                        if (own(file, 'deleted')) flags.push(file.deleted === true ? 'удалён' : file.deleted === false ? 'не удалён' : `удалён: ${text(file.deleted)}`);
                        lines.push(`${index + 1}. ${text(file.fileName ?? file.objectId ?? '(имя отсутствует)')}${flags.length ? ' — ' + flags.join(', ') : ''}`);
                    });
                }
                if (Array.isArray(v.filesError)) {
                    lines.push(`Ошибок файлов: ${v.filesError.length}`);
                    v.filesError.forEach(error => lines.push(text(error)));
                }
                return lines.join('\n') || text(v);
            }
            case 'ConfirmAddress': case 'ConfirmRegAddr': case 'AddressInput':
                return text(v.address?.fullAddress ?? v.fullAddress ?? v);
            case 'DropDown': case 'Lookup':
                return text(v.text ?? v.originalItem?.attributeValues?.NAME ?? v.originalItem?.title ?? v);
            case 'MapService': return text(v.title ?? v);
            case 'DocInput': {
                const fields = [['series', 'Серия'], ['number', 'Номер'], ['date', 'Дата выдачи'], ['emitter', 'Кем выдан']];
                return fields.filter(([k]) => own(v, k)).map(([k, label]) =>
                    `${label}: ${k === 'date' ? date(v[k]) : text(v[k])}`).join('\n') || text(v);
            }
            case 'FileUploadComponent':
                return `Файлов: ${v.totalCount ?? 'неизвестно'}, объём: ${v.totalSize ?? 'неизвестно'} байт`;
            default:
                if (Array.isArray(v.states)) return v.states.map(s =>
                    [s.groupName, ...(s.fields || []).map(f => `${f.label}: ${text(f.value)}`)].filter(Boolean).join('\n')).join('\n\n') || text(v);
                return text(v.storedValues ?? v);
        }
    }
    function answers(raw) {
        const out = new Map();
        for (const [id, a] of Object.entries(raw || {})) {
            if (!object(a)) continue;
            out.set(id, { hasValue: own(a, 'value'), raw: a.value, value: decode(a.value), visited: a.visited });
        }
        return out;
    }
    function parseDraft(input) {
        if (typeof input !== 'string') return input;
        let s = input.replace(/^\uFEFF/, '').trim();
        if (/^(?:const|let|var)\s+draft\s*=/.test(s)) {
            const m = /^(?:const|let|var)\s+draft\s*=\s*([\s\S]*?)\s*;\s*(?:DraftHelper\.setDraft\(draft\)\s*;?)?\s*$/.exec(s);
            if (!m) throw new Error('Некорректная оболочка черновика');
            s = m[1];
        }
        return JSON.parse(s);
    }
    function normalize(input) {
        // Принимаем объект или JSON; код из файла черновика не выполняем.
        const d = parseDraft(input);
        if (!object(d?.body) || !object(d.body.applicantAnswers)) throw new Error('Ожидается черновик с body.applicantAnswers');
        const cycles = new Map(), owners = new Map();
        for (const c of d.body.cycledApplicantAnswers?.answerlist || []) {
            if (typeof c.id !== 'string' || cycles.has(c.id) || !Array.isArray(c.items)) throw new Error('Некорректное описание цикла');
            const fields = new Set();
            const items = c.items.map((i, position) => {
                const a = answers(i.itemAnswers);
                for (const key of a.keys()) fields.add(key);
                return { id: i.id, index: i.index ?? position, position, answers: a,
                    screens: new Set(i.finishedScreens || []) };
            });
            for (const key of fields) {
                if (!owners.has(key)) owners.set(key, new Set());
                owners.get(key).add(c.id);
            }
            cycles.set(c.id, { id: c.id, initScreen: c.initScreen, items, fields });
        }
        return { globals: answers(d.body.applicantAnswers), cycles, owners };
    }
    function components(display) {
        const result = [], seen = new Set();
        function walk(list, cycleId) {
            for (const c of Array.isArray(list) ? list : []) {
                if (!object(c) || seen.has(c)) continue;
                seen.add(c);
                const nested = c.attrs?.components;
                const isCycle = c.attrs?.isCycled === true || c.isCycled === true ||
                    (display?.type === 'REPEATABLE' && Array.isArray(nested));
                // Контейнер цикла не является полем ответа. Показываем только его дочерние поля текущего экрана.
                if (isCycle) { walk(nested, c.id); continue; }
                if (typeof c.id === 'string') result.push({ ...c, cycleScope: cycleId });
                walk(c.components, cycleId); walk(c.children, cycleId); walk(nested, cycleId);
            }
        }
        walk(display?.components);
        return result;
    }
    function findDto(payload) {
        const queue = [payload], seen = new Set();
        for (let n = 0; n < queue.length && n < 10000; n++) {
            const v = queue[n];
            if (!v || typeof v !== 'object' || seen.has(v)) continue;
            seen.add(v);
            if (object(v.scenarioDto?.display)) return v.scenarioDto;
            if (object(v.display) && (typeof v.display.id === 'string')) return v;
            for (const child of Object.values(v)) if (child && typeof child === 'object') queue.push(child);
        }
        return null;
    }
    function copyValue(component, raw) {
        const value = decode(raw);
        if (component.type === 'PaymentTypeSelector' && object(value) && own(value, 'selected')) return value.selected == null ? text(value.selected) : String(value.selected);
        if (['MaritalStatusInput', 'PaymentTypeSelector', 'UnusedPayments', 'PaymentScr', 'PoddFileUpload'].includes(component.type)) {
            return value === '' ? '' : format(component, raw);
        }
        if (['DateInput', 'AddressInput', 'Lookup', 'DropDown'].includes(component.type)) {
            return value === '' ? '' : format(component, raw);
        }
        return typeof value === 'string' ? value : value === undefined ? '' :
            value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    }
    // Диагностические снимки независимы от подсказок и не выполняют код компонентов.
    function diagnosticSnapshot(dto, metadata = {}) {
        let remaining = 64000, truncated = false;
        const inspect = value => {
            if (value === undefined) return '(поле отсутствует)';
            if (remaining <= 0) { truncated = true; return '(лимит снимка)'; }
            let formatted;
            try { formatted = text(decode(value)); } catch { formatted = '(не удалось сериализовать)'; }
            const limit = Math.min(8000, remaining);
            if (formatted.length > limit) { formatted = formatted.slice(0, limit) + '\n… [сокращено]'; truncated = true; }
            remaining -= formatted.length;
            return formatted;
        };
        const list = Array.isArray(dto.logicComponents) ? dto.logicComponents : [];
        const displayed = components(dto.display);
        const brief = c => ({ id: String(c.id ?? '').slice(0, 200), type: String(c.type ?? '').slice(0, 100),
            name: String(c.label || c.name || c.title || '').slice(0, 600) });
        const answer = (map, id) => !own(map, id) ? '(запись отсутствует)' :
            `visited: ${text(map[id]?.visited)}\nvalue:\n${inspect(map[id]?.value)}`;
        const cycleItem = dto.cycledApplicantAnswers?.inCycle === true ?
            dto.cycledApplicantAnswerContext?.cycledApplicantAnswerItem : null;
        const logic = list.slice(0, 100).filter(object).map(c => ({
            ...brief(c), arguments: inspect(c.arguments), value: inspect(c.value), attrs: inspect(c.attrs),
            applicantAnswer: answer(dto.applicantAnswers, c.id), cachedAnswer: answer(dto.cachedAnswers, c.id),
            cycleAnswer: cycleItem ? answer(cycleItem.itemAnswers, c.id) : '(нет активного контекста элемента)'
        }));
        return {
            screenId: String(dto.display?.id ?? 'unknown').slice(0, 200),
            screenName: String(dto.display?.name ?? '').slice(0, 600),
            screenType: String(dto.display?.type ?? '').slice(0, 100),
            scenario: String(dto.currentScenarioId ?? '').slice(0, 100),
            orderId: String(dto.orderId ?? '').slice(0, 100),
            serviceCode: String(dto.serviceCode ?? '').slice(0, 100),
            hidden: displayed.some(c => c.type === 'Redirect'),
            fields: displayed.slice(0, 100).map(c => ({ ...brief(c),
                actions: c.type === 'Redirect' ? inspect(c.attrs?.actions) : undefined })),
            logic, logicCount: list.length,
            cycle: inspect({ inCycle: dto.cycledApplicantAnswers?.inCycle,
                cycleId: dto.cycledApplicantAnswers?.currentAnswerId,
                itemId: cycleItem?.id, index: cycleItem?.index }),
            transport: ['fetch', 'xhr'].includes(metadata.transport) ? metadata.transport : 'manual',
            url: String(metadata.url ?? '').slice(0, 2000), status: metadata.status,
            time: new Date().toISOString(), truncated: truncated || list.length > 100 || displayed.length > 100
        };
    }
    const runColors = ['green', 'yellow', 'red'];
    const RunText = {
        stringify(run) {
            const line = value => JSON.stringify(String(value ?? ''));
            return `Услуга: ${line(run.service)}\nФормат: DraftHelper Run v1\n` + run.steps.map((step, i) =>
                `\nШаг: ${i + 1}\nID: ${line(step.id)}\nНазвание: ${line(step.name)}\nЦвет: ${step.color}\nКомментарий: ${line(step.comment)}\n`).join('');
        },
        parse(input) {
            if (typeof input !== 'string' || input.length > 10000000) throw new Error('Файл слишком большой или не является текстом');
            const lines = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd().split('\n');
            const read = (line, prefix) => {
                if (!line?.startsWith(prefix)) throw new Error('Неверная структура TXT');
                const value = JSON.parse(line.slice(prefix.length));
                if (typeof value !== 'string') throw new Error('Ожидалась строка');
                return value;
            };
            const service = read(lines[0], 'Услуга: '), steps = [];
            if (lines[1] !== 'Формат: DraftHelper Run v1') throw new Error('Неизвестный формат журнала');
            let i = 2;
            while (i < lines.length) {
                if (lines[i++] !== '' || lines[i++] !== `Шаг: ${steps.length + 1}`) throw new Error('Нарушена нумерация шагов');
                const id = read(lines[i++], 'ID: '), name = read(lines[i++], 'Название: ');
                const colorLine = lines[i++];
                const color = colorLine?.startsWith('Цвет: ') ? colorLine.slice(6) : '';
                if (!runColors.includes(color)) throw new Error('Неизвестный цвет шага');
                const comment = read(lines[i++], 'Комментарий: ');
                steps.push({ id, name, color, comment });
            }
            return { service, steps };
        }
    };
    class Journal {
        constructor(limit = 50) { this.limit = limit; this.entries = []; this.counter = 0; this.steps = []; }
        append(dto, metadata, applied) {
            const entry = { ...diagnosticSnapshot(dto, metadata), number: ++this.counter, applied };
            if (applied) {
                entry.step = { id: entry.screenId, name: entry.screenName || '', color: 'green', comment: '', number: this.steps.length + 1 };
                this.steps.push(entry.step);
            }
            this.entries.push(entry);
            if (this.entries.length > this.limit) this.entries.shift();
            return entry;
        }
        clear() { this.entries.length = 0; this.steps.length = 0; }
    }
    class Engine {
        constructor() { this.model = null; this.dto = null; this.bindings = new Map(); this.manualCycle = null; this.scopeOverrides = new Map(); this.identity = {}; }
        setDraft(d) { this.model = normalize(d); this.bindings.clear(); this.manualCycle = null; this.scopeOverrides.clear(); }
        update(dto) {
            const keys = ['serviceCode', 'orderId', 'currentScenarioId'];
            if (keys.some(k => this.identity[k] != null && dto[k] != null && String(this.identity[k]) !== String(dto[k]))) {
                this.bindings.clear(); this.manualCycle = null; this.scopeOverrides.clear();
                this.identity = {};
            }
            for (const k of keys) if (dto[k] != null) this.identity[k] = dto[k];
            this.dto = dto;
            if (dto.cycledApplicantAnswers?.inCycle === false) this.manualCycle = null;
            if (this.manualCycle) {
                const c = this.model?.cycles.get(this.manualCycle);
                const belongs = c && (c.initScreen === dto.display.id || c.items.some(i => i.screens.has(dto.display.id)) ||
                    components(dto.display).some(x => c.fields.has(x.id)));
                if (!belongs) this.manualCycle = null;
            }
        }
        context() {
            const ca = this.dto?.cycledApplicantAnswers;
            const active = ca?.inCycle === true;
            let cycleId = active ? ca.currentAnswerId : null;
            let reason = active ? 'Контекст текущего ответа' : 'Экран вне цикла';
            const initial = this.model ? [...this.model.cycles.values()].filter(c =>
                c.initScreen === this.dto?.display?.id) : [];
            const initializing = !active && initial.length > 0;
            if (!active && (ca?.inCycle !== false || initializing) && this.model) {
                const screen = this.dto?.display?.id;
                const cs = components(this.dto?.display);
                const candidates = initializing ? initial : [...this.model.cycles.values()].filter(c => c.initScreen === screen ||
                    c.items.some(i => i.screens.has(screen)) || cs.some(x => c.fields.has(x.id)));
                if (this.manualCycle) { cycleId = this.manualCycle; reason = 'Цикл выбран вручную'; }
                else if (candidates.length === 1) { cycleId = candidates[0].id; reason = 'Цикл определён по экрану; выберите элемент'; }
                else if (candidates.length > 1) reason = 'Несколько возможных циклов: выберите цикл';
            }
            const cycle = this.model?.cycles.get(cycleId);
            // Здесь используется только последний текущий ответ, а не контекст сохранённого черновика.
            const item = active ? this.dto?.cycledApplicantAnswerContext?.cycledApplicantAnswerItem : null;
            const liveCycle = active ? ca.answerlist?.find(c => c.id === cycleId) : null;
            const id = liveCycle?.currentItemId ?? item?.id;
            const conflict = id != null && item?.id != null && String(id) !== String(item.id);
            const token = JSON.stringify([String(this.identity.currentScenarioId ?? ''), cycleId ?? '',
                id != null ? ['id', String(id)] : active && item?.index != null ? ['index', item.index] : ['manual']]);
            const position = conflict ? undefined : this.bindings.get(token);
            return { cycleId, cycle, token, position, reason: conflict ? 'Противоречивый контекст элемента' : reason,
                conflict, liveId: id, liveIndex: item?.index, active, initializing };
        }
        selectCycle(id) {
            if (id && !this.model?.cycles.has(id)) throw new Error('Неизвестный цикл');
            this.manualCycle = id || null;
        }
        selectItem(position) {
            const c = this.context();
            if (!c.cycle || c.conflict) throw new Error('Контекст цикла не определён');
            if (position === null) this.bindings.delete(c.token);
            else {
                if (!Number.isInteger(position) || !c.cycle.items[position]) throw new Error('Неизвестный элемент');
                this.bindings.set(c.token, position);
            }
        }
        resolve(id, cycleScope, previewPosition) {
            if (!this.model) return { status: 'no-draft' };
            const ctx = this.context(), owners = this.model.owners.get(id);
            // Явный предпросмотр доступен только на начальном экране цикла и не меняет текущую привязку.
            if (previewPosition !== undefined) {
                if (!ctx.initializing || cycleScope !== ctx.cycleId ||
                    !Number.isInteger(previewPosition) || !ctx.cycle?.items[previewPosition]) return { status: 'unresolved' };
                ctx.position = previewPosition;
            }
            const override = cycleScope || this.scopeOverrides.get(id);
            let a, source;
            if (cycleScope && ctx.cycleId !== cycleScope) return { status: 'unresolved' };
            if (override === 'global') { a = this.model.globals.get(id); source = `applicantAnswers.${id}`; }
            else if (ctx.cycle && (ctx.cycle.fields.has(id) || override === ctx.cycleId)) {
                if (ctx.position === undefined) return { status: 'unresolved' };
                a = ctx.cycle.items[ctx.position].answers.get(id);
                source = `${ctx.cycleId}.items[${ctx.position}].itemAnswers.${id}`;
            } else if ((override && override !== 'global') || (owners &&
                (!this.model.globals.has(id) || (ctx.active && !ctx.cycle) ||
                    (!ctx.cycle && this.dto?.cycledApplicantAnswers?.inCycle !== false)))) {
                return { status: 'unresolved' };
            } else { a = this.model.globals.get(id); source = `applicantAnswers.${id}`; }
            return { status: !a ? 'missing' : !a.hasValue ? 'no-value' : 'found', answer: a, source };
        }
    }
    // Необязательный исходник услуги: читаем объявления, не выполняем linkedValues и выражения.
    class ServiceDefinition {
        constructor(input, name = '') {
            const data = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input;
            if (!object(data) || !Array.isArray(data.screens) || !Array.isArray(data.applicationFields)) {
                throw new Error('Ожидаются массивы screens и applicationFields');
            }
            this.name = String(name || data.serviceName || data.service || 'Описание услуги');
            this.serviceName = typeof data.serviceName === 'string' ? data.serviceName : typeof data.service === 'string' ? data.service : '';
            this.passport = data.catalog?.passCode == null ? null : String(data.catalog.passCode);
            this.version = data.version == null ? null : String(data.version);
            this.screens = new Map(); this.fields = new Map(); this.cycleOwners = new Map(); this.screenCycles = new Map();
            this.warnings = []; this.rules = {};
            for (const [items, index] of [[data.screens, this.screens], [data.applicationFields, this.fields]]) {
                for (const item of items) {
                    if (!object(item) || typeof item.id !== 'string' || !item.id || index.has(item.id)) throw new Error('Некорректный или повторный ID');
                    index.set(item.id, item);
                }
            }
            for (const table of ['screenRules', 'cycledScreenRules']) {
                const raw = data[table] ?? {};
                if (!object(raw) || Object.values(raw).some(r => !Array.isArray(r))) throw new Error('Некорректный раздел ' + table);
                this.rules[table] = raw;
            }
            const walk = (ref, cycleId, ancestors, roots) => {
                const c = typeof ref === 'string' ? this.fields.get(ref) : ref;
                if (!object(c)) { this.warnings.push('Не найден компонент: ' + String(ref)); return; }
                if (ancestors.has(c.id)) { this.warnings.push('Замкнутая вложенность: ' + c.id); return; }
                if (cycleId && c.id !== cycleId) {
                    if (!this.cycleOwners.has(c.id)) this.cycleOwners.set(c.id, new Set());
                    this.cycleOwners.get(c.id).add(cycleId);
                }
                const cyclic = c.attrs?.isCycled === true || ['RepeatableFields', 'ChildrenList'].includes(c.type);
                if (cyclic) { roots.add(c.id); cycleId = c.id; }
                const next = new Set(ancestors); next.add(c.id);
                if (c.attrs?.components != null && !Array.isArray(c.attrs.components)) throw new Error('Некорректная вложенность: ' + c.id);
                for (const child of c.attrs?.components || []) walk(child, cycleId, next, roots);
            };
            for (const screen of this.screens.values()) {
                const roots = new Set();
                for (const key of ['components', 'logicComponents', 'logicAfterValidationComponents', 'afterOrderCreatedComponents', 'infoComponents']) {
                    if (screen[key] != null && !Array.isArray(screen[key])) throw new Error('Некорректный список компонентов: ' + screen.id);
                    for (const ref of screen[key] || []) walk(ref, null, new Set(), roots);
                }
                this.screenCycles.set(screen.id, roots);
            }
            // Обходим объявленные циклические переходы, чтобы учесть поля последующих экранов элемента,
            // а не только attrs.components начального экрана. Условия переходов здесь не вычисляются.
            for (const [start, roots] of this.screenCycles) for (const cycleId of roots) {
                const queue = [start], seen = new Set();
                for (let i = 0; i < queue.length; i++) {
                    const id = queue[i]; if (seen.has(id)) continue; seen.add(id);
                    const screen = this.screens.get(id); if (!screen) continue;
                    for (const ref of screen.components || []) walk(ref, cycleId, new Set(), new Set());
                    for (const rule of own(this.rules.cycledScreenRules, id) ? this.rules.cycledScreenRules[id] : []) if (typeof rule?.nextDisplay === 'string') queue.push(rule.nextDisplay);
                }
            }
        }
        compatibility(dto) {
            let passport = dto?.serviceInfo?.catalogInfo?.passport;
            if (passport == null && typeof dto?.currentUrl === 'string') {
                const match = /\/(\d+)\/\d+\/form(?:[/?#]|$)/.exec(dto.currentUrl);
                if (match) passport = match[1];
            }
            if (passport != null && this.passport != null && String(passport) !== this.passport) {
                return { ok: false, message: 'Исходник другой услуги: ' + this.passport + ', текущее прохождение: ' + passport };
            }
            if (!this.screens.has(dto?.display?.id)) return { ok: false, message: 'Текущий экран отсутствует в исходнике. Проверьте версию услуги.' };
            return { ok: true, message: (passport == null || this.passport == null ? 'Соответствие проверено только по ID экрана. ' : 'Код услуги совпадает. ') +
                'Совпадение версии с текущим прохождением не подтверждено.' };
        }
    }
    // Канонический JSON сохраняет типы простых значений и порядок массива, игнорируя порядок ключей объекта.
    function canonical(value) {
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
        return JSON.stringify(value);
    }
    function valueDiff(left, right, limit = 100) {
        const rows = [];
        function walk(a, b, path, hasA = true, hasB = true) {
            if (rows.length >= limit) return;
            if (hasA && hasB && canonical(a) === canonical(b)) return;
            if (hasA && hasB && ((object(a) && object(b)) || (Array.isArray(a) && Array.isArray(b)))) {
                const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
                if (keys.size) { for (const key of keys) walk(a[key], b[key], path + '[' + JSON.stringify(key) + ']', own(a,key), own(b,key)); return; }
            }
            rows.push({ path, current: hasA ? text(a) : '(поле отсутствует)', draft: hasB ? text(b) : '(поле отсутствует)' });
        }
        walk(left,right,'$'); return rows;
    }
    class BackRestTracker {
        constructor(definition) {
            this.definition = definition; this.declarations = new Map();
            for (const field of definition.fields.values()) if (field.type === 'BackRestCall') this.declarations.set(field.id, []);
            for (const screen of definition.screens.values()) {
                const seen = new Set();
                const visit = ref => {
                    const field = typeof ref === 'string' ? definition.fields.get(ref) : object(ref) ? { ...definition.fields.get(ref.id), ...ref } : null;
                    if (!field || seen.has(field.id)) return; seen.add(field.id);
                    if (field.type === 'BackRestCall') {
                        if (!this.declarations.has(field.id)) this.declarations.set(field.id, []);
                        this.declarations.get(field.id).push({ id: screen.id, name: screen.name || '', type: screen.type || '' });
                    }
                    for (const child of field.attrs?.components || []) visit(child);
                };
                for (const key of ['components','logicComponents','logicAfterValidationComponents','afterOrderCreatedComponents','infoComponents']) for (const ref of screen[key] || []) visit(ref);
            }
            this.clear();
        }
        clear() { this.values = new Map(); this.scopes = new Set(); this.events = []; this.visits = []; this.identity = {}; this.message = ''; }
        observe(dto, step) {
            const keys = ['serviceCode','orderId','currentScenarioId'];
            if (keys.some(key => this.identity[key] != null && dto[key] != null && String(this.identity[key]) !== String(dto[key]))) this.clear();
            for (const key of keys) if (dto[key] != null) this.identity[key] = dto[key];
            const compatibility = this.definition.compatibility(dto);
            if (!compatibility.ok) { this.message = compatibility.message; return; }
            this.message = '';
            const currentStep = step ? { number: step.number, id: step.id, name: step.name || '' } : null;
            if (currentStep && !this.visits.some(v => v.number === currentStep.number)) this.visits.push(currentStep);
            const scopes = [{ key: 'global', answers: dto.applicantAnswers, cycleId: null, itemId: null }];
            const ca = dto.cycledApplicantAnswers, item = dto.cycledApplicantAnswerContext?.cycledApplicantAnswerItem;
            const liveId = ca?.answerlist?.find(c => c.id === ca.currentAnswerId)?.currentItemId;
            if (ca?.inCycle === true && ca.currentAnswerId && item && !(liveId != null && item.id != null && String(liveId) !== String(item.id))) {
                const token = liveId ?? item.id ?? item.index;
                if (token != null) scopes.push({key: JSON.stringify([ca.currentAnswerId,token]), answers:item.itemAnswers, cycleId:ca.currentAnswerId, itemId:token});
            }
            for (const scope of scopes) {
                if (!object(scope.answers)) continue;
                const initial = !this.scopes.has(scope.key); this.scopes.add(scope.key);
                for (const [id, screens] of this.declarations) {
                    const answer = own(scope.answers,id) ? scope.answers[id] : null;
                    if (!object(answer) || !own(answer,'value') || answer.value === undefined) continue;
                    const value = decode(answer.value), serialized = canonical(value), key = JSON.stringify([scope.key,id]);
                    const previous = this.values.get(key);
                    if (previous?.serialized === serialized) continue;
                    // Сохраняем независимый JSON-снимок, чтобы изменения исходного ответа не меняли событие.
                    const event = { id, kind: initial ? 'initial' : previous ? 'changed' : 'appeared',
                        value: JSON.parse(JSON.stringify(value)), step: currentStep, cycleId: scope.cycleId, itemId: scope.itemId,
                        screens, observed: initial ? [] : this.visits.filter(v => screens.some(s => s.id === v.id) && v.number > (previous?.stepNumber || 0)).map(v=>({...v})) };
                    this.values.set(key,{serialized,stepNumber:currentStep?.number || 0}); this.events.push(event);
                    if (this.events.length > 100) this.events.shift();
                }
            }
        }
    }
    const triAnd = results => results.includes(false) ? false : results.includes(null) ? null : true;
    class TransitionPredictor {
        constructor(definition) { this.definition = definition; }
        field(path, engine, mode, group) {
            if (typeof path !== 'string' || !path || /[${}]/.test(path)) return { known: false, reason: 'Неподдерживаемый путь поля' };
            const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
            if (parts.some(p => !/^[\w-]+$/.test(p) || ['__proto__', 'prototype', 'constructor'].includes(p))) return { known: false, reason: 'Неподдерживаемый путь поля' };
            const id = parts.shift(), dto = engine.dto;
            const owners = this.definition.cycleOwners.get(id);
            let map, origin = mode === 'draft' ? 'Черновик: applicantAnswers' : 'Текущий ответ: applicantAnswers';
            const liveItem = dto?.cycledApplicantAnswerContext?.cycledApplicantAnswerItem;
            const isItem = group.cycled && (owners?.has(group.cycleId) || engine.model?.cycles.get(group.cycleId)?.fields.has(id) ||
                (mode === 'live' && own(liveItem?.itemAnswers, id)));
            if (group.cycled && owners?.size && !group.cycleId) return { known: false, reason: 'Не определён цикл для поля ' + id };
            if (isItem) {
                if (mode === 'draft') {
                    const context = engine.context();
                    if (context.cycleId !== group.cycleId || context.position === undefined) return { known: false, reason: 'Выберите элемент исходного черновика' };
                    map = context.cycle.items[context.position].answers;
                    origin = 'Черновик: ' + group.cycleId + ' · элемент ' + (context.position + 1);
                } else {
                    if (dto?.cycledApplicantAnswers?.inCycle !== true || dto.cycledApplicantAnswers.currentAnswerId !== group.cycleId || !object(liveItem?.itemAnswers)) {
                        return { known: false, reason: 'В текущем ответе нет активного элемента цикла' };
                    }
                    const current = dto.cycledApplicantAnswers.answerlist?.find(c => c.id === group.cycleId)?.currentItemId;
                    if (current != null && liveItem.id != null && String(current) !== String(liveItem.id)) return { known: false, reason: 'Противоречивый контекст элемента' };
                    map = liveItem.itemAnswers; origin = 'Текущий ответ: itemAnswers';
                }
            } else map = mode === 'draft' ? engine.model?.globals : dto?.applicantAnswers;
            const record = map instanceof Map ? map.get(id) : own(map, id) ? map[id] : undefined;
            if (!object(record)) return { known: false, reason: 'Нет ответа ' + id + ' (' + origin + ')' };
            let value = map instanceof Map ? { visited: record.visited, ...(record.hasValue ? { value: record.value } : {}) } : record;
            const answer = value;
            for (const key of parts) {
                value = decode(value);
                if (value == null || typeof value !== 'object' || !own(value, key)) return { known: false, reason: 'Нет значения по пути ' + path, answer, origin };
                value = value[key];
            }
            return { known: true, value: decode(value), answer, origin, bare: parts.length === 0 };
        }
        condition(c, engine, mode, group) {
            const unknown = reason => ({ state: null, reason });
            if (!object(c)) return unknown('Некорректное условие');
            const allowed = new Set(['fieldType', 'predicate', 'args', 'field', 'protectedField', 'variable', 'visited', 'value']);
            if (Object.keys(c).some(k => !allowed.has(k) && c[k] != null)) return unknown('Неизвестные параметры условия');
            if (c.protectedField != null || c.variable != null) return unknown('Защищённые поля и переменные пока не вычисляются');
            const read = this.field(c.field, engine, mode, group);
            if (!read.known) return unknown(read.reason);
            const states = [], reasons = [];
            if (c.visited != null) {
                if (typeof c.visited !== 'boolean') return unknown('Неподдерживаемое значение visited');
                const observed = read.answer.visited;
                states.push(typeof observed === 'boolean' ? observed === c.visited : null);
                reasons.push(c.field + ': visited = ' + String(observed ?? 'неизвестно') + ', нужно ' + c.visited);
            }
            if (c.predicate == null) {
                if (c.args != null || c.fieldType != null) return unknown('Тип или аргументы без предиката');
                // В старом формате правил value:null оставляет только явно заданную проверку visited.
                if (c.value != null) {
                    const actual = read.bare ? decode(read.answer.value) : read.value;
                    const supported = ['string', 'number', 'boolean'].includes(typeof c.value) && typeof actual === typeof c.value;
                    states.push(supported ? Object.is(actual, c.value) : null);
                    reasons.push(c.field + ': ' + text(actual) + ' = ' + text(c.value));
                }
                if (!states.length) return unknown('Условие не содержит поддерживаемой проверки');
                return { state: triAnd(states), reason: reasons.join('; '), origin: read.origin };
            }
            if (c.value != null) return unknown('Смешанное условие predicate и value');
            const actual = read.bare ? (own(read.answer, 'value') ? decode(read.answer.value) : undefined) : read.value;
            if (actual === undefined) return unknown('Поле value отсутствует; это не явный null');
            let result;
            if (['isNull', 'nonNull'].includes(c.predicate)) {
                if (c.args != null && (!Array.isArray(c.args) || c.args.length)) return unknown('Неожиданные аргументы проверки null');
                result = c.predicate === 'isNull' ? actual === null : actual !== null;
                reasons.push(c.field + ': ' + c.predicate + ' → ' + result);
            } else {
                if (!['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqualTo', 'smallerThan', 'smallerThanOrEqualTo'].includes(c.predicate)) return unknown('Предикат пока не поддерживается: ' + c.predicate);
                if (!Array.isArray(c.args) || c.args.length !== 1 || !object(c.args[0]) || c.args[0].type !== 'UserConst' || !own(c.args[0], 'value')) return unknown('Поддерживается один аргумент UserConst');
                if (Object.keys(c.args[0]).some(k => !['type', 'value'].includes(k) && c.args[0][k] != null)) return unknown('Неизвестные параметры аргумента');
                let a = actual, b = c.args[0].value;
                if (typeof b === 'string' && b.includes('${')) return unknown('Вычисляемый аргумент');
                if (c.fieldType === 'Integer') {
                    const integer = x => (typeof x === 'number' || typeof x === 'string' && /^-?\d+$/.test(x)) && Number.isSafeInteger(Number(x));
                    if (!integer(a) || !integer(b)) return unknown('Не удалось прочитать целое число');
                    a = Number(a); b = Number(b);
                } else if ((c.fieldType === 'String' || c.fieldType == null) && typeof a === 'string' && typeof b === 'string') {
                    if (!['equals', 'notEquals'].includes(c.predicate)) return unknown('Порядковые сравнения строк не поддерживаются');
                } else return unknown('Неподдерживаемый тип сравнения: ' + String(c.fieldType));
                result = ({ equals: () => a === b, notEquals: () => a !== b, greaterThan: () => a > b,
                    greaterThanOrEqualTo: () => a >= b, smallerThan: () => a < b, smallerThanOrEqualTo: () => a <= b })[c.predicate]();
                reasons.push(c.field + ': ' + text(a) + ' ' + c.predicate + ' ' + text(b));
            }
            states.push(result);
            return { state: triAnd(states), reason: reasons.join('; '), origin: read.origin };
        }
        predict(engine, mode = 'live') {
            const dto = engine.dto, definition = this.definition;
            if (!dto) return { message: 'Ожидается текущий экран', groups: [] };
            const compatibility = definition.compatibility(dto);
            if (!compatibility.ok) return { message: compatibility.message, groups: [] };
            if (mode === 'draft' && !engine.model) return { message: 'Загрузите исходный черновик', groups: [] };
            const id = dto.display.id, active = dto.cycledApplicantAnswers?.inCycle;
            const initialCycles = [...(definition.screenCycles.get(id) || [])];
            const tables = active === true ? ['cycledScreenRules'] : active === false && !initialCycles.length ? ['screenRules'] :
                ['screenRules', 'cycledScreenRules'].filter(t => own(definition.rules[t], id));
            const groups = tables.map(table => {
                const group = { table, cycled: table === 'cycledScreenRules', cycleId: active === true ? dto.cycledApplicantAnswers.currentAnswerId :
                    initialCycles.length === 1 ? initialCycles[0] : null };
                group.label = initialCycles.length && active !== true ? (group.cycled ? 'Переход внутри элемента' : 'Продолжение после списка') :
                    group.cycled ? 'Переход в цикле' : 'Обычный переход';
                const rules = own(definition.rules[table], id) ? definition.rules[table][id] : [];
                group.rules = rules.map((r, index) => {
                    let checks;
                    if (!object(r) || !Array.isArray(r.conditions) || Object.keys(r).some(k => !['conditions', 'nextDisplay', 'cycleInitializer'].includes(k) && r[k] != null) ||
                        r.cycleInitializer != null && typeof r.cycleInitializer !== 'boolean') checks = [{ state: null, reason: 'Неподдерживаемая структура правила' }];
                    else checks = r.conditions.map(c => this.condition(c, engine, mode, group));
                    if (!own(r, 'nextDisplay') || r.nextDisplay != null && (typeof r.nextDisplay !== 'string' || !definition.screens.has(r.nextDisplay))) {
                        checks.push({ state: null, reason: 'Целевой экран отсутствует в описании' });
                    }
                    return { number: index + 1, target: r?.nextDisplay, initializer: r?.cycleInitializer === true, checks, state: triAnd(checks.map(c => c.state)) };
                });
                const matches = group.rules.filter(r => r.state === true), unknown = group.rules.filter(r => r.state === null);
                const targets = new Set(matches.map(r => r.target));
                group.status = !rules.length ? 'no-rules' : matches.length && !unknown.length && targets.size === 1 ? 'expected' :
                    matches.length || unknown.length ? 'possible' : 'no-match';
                group.target = group.status === 'expected' ? matches[0].target : undefined;
                if (active == null && !initialCycles.length) { group.status = 'possible'; group.contextUnknown = true; }
                return group;
            });
            return { message: compatibility.message, groups };
        }
    }

    const DraftModel = Object.freeze({ parse: parseDraft, normalize });
    const ComponentValues = Object.freeze({ decode, format, copy: copyValue, date });

    class ReplaySession {
        constructor(engine = new Engine(), journal = new Journal()) {
            this.engine = engine; this.journal = journal;
            this.sequence = 0; this.accepted = 0; this.liveEntry = null;
        }
        nextTicket() { return ++this.sequence; }
        ingest(payload, sequence, metadata = {}) {
            const dto = findDto(payload);
            if (!dto) return null;
            const ticket = sequence ?? this.nextTicket();
            if (!Number.isSafeInteger(ticket) || ticket < 0) throw new Error('Некорректный номер ответа');
            this.sequence = Math.max(this.sequence, ticket);
            const applied = ticket >= this.accepted;
            let entry = null, diagnosticsError = false;
            // Ошибка диагностики не должна мешать обновлению корректного состояния прохождения.
            try { entry = this.journal.append(dto, metadata, applied); }
            catch { diagnosticsError = true; }
            if (applied) {
                this.engine.update(dto); this.accepted = ticket; this.liveEntry = entry;
            }
            return { applied, entry, diagnosticsError };
        }
        clear() {
            this.journal.clear(); this.liveEntry = null;
            this.engine.model = null; this.engine.dto = null;
            this.engine.bindings.clear(); this.engine.scopeOverrides.clear(); this.engine.manualCycle = null; this.engine.identity = {};
        }
    }

    class NetworkObserver {
        constructor(root, onPayload, nextTicket, report) {
            this.root = root; this.onPayload = onPayload; this.nextTicket = nextTicket; this.report = report;
            this.pendingXHR = new Map(); this.disposed = false; this.started = false;
        }
        start() {
            if (this.started) return;
            this.started = true;
            const root = this.root;
            const self = this;
            this.originalFetch = root.fetch;
            if (typeof this.originalFetch === 'function') {
                this.fetchWrapper = function (...args) {
                    const ticket = self.nextTicket();
                    return self.originalFetch.apply(this, args).then(response => {
                        if (!self.disposed) {
                            try {
                                const type = response.headers.get('content-type') || '';
                                if (/json/i.test(type)) response.clone().json().then(data => {
                                    try { self.onPayload(data, ticket, { transport: 'fetch', url: response.url, status: response.status }); } catch { self.report('Ошибка обработки ответа fetch'); }
                                }, () => {});
                            } catch { self.report('Не удалось прочитать копию ответа'); }
                        }
                        return response;
                    });
                };
                root.fetch = this.fetchWrapper;
            }
            const proto = root.XMLHttpRequest?.prototype;
            if (!proto) return;
            this.xhrProto = proto; this.originalSend = proto.send;
            this.sendWrapper = function (...args) {
                if (self.disposed) return self.originalSend.apply(this, args);
                const xhr = this, ticket = self.nextTicket();
                const previous = self.pendingXHR.get(xhr);
                if (previous) xhr.removeEventListener('loadend', previous);
                const listener = () => {
                    self.pendingXHR.delete(xhr);
                    if (self.disposed) return;
                    try {
                        const metadata = { transport: 'xhr', url: xhr.responseURL, status: xhr.status };
                        if (xhr.responseType === 'json') self.onPayload(xhr.response, ticket, metadata);
                        else if ((!xhr.responseType || xhr.responseType === 'text') && /json/i.test(xhr.getResponseHeader('content-type') || '')) {
                            self.onPayload(JSON.parse(xhr.responseText), ticket, metadata);
                        }
                    } catch { self.report('Ошибка обработки ответа XHR'); }
                };
                self.pendingXHR.set(xhr, listener);
                xhr.addEventListener('loadend', listener, { once: true });
                try { return self.originalSend.apply(xhr, args); }
                catch (error) { xhr.removeEventListener('loadend', listener); self.pendingXHR.delete(xhr); throw error; }
            };
            proto.send = this.sendWrapper;
        }
        stop() {
            this.disposed = true;
            if (this.fetchWrapper && this.root.fetch === this.fetchWrapper) this.root.fetch = this.originalFetch;
            if (this.xhrProto && this.sendWrapper && this.xhrProto.send === this.sendWrapper) this.xhrProto.send = this.originalSend;
            for (const [xhr, listener] of this.pendingXHR) xhr.removeEventListener('loadend', listener);
            this.pendingXHR.clear();
        }
    }

    const core = { BackRestTracker, canonical, valueDiff, RunText, ServiceDefinition, TransitionPredictor, DraftModel, ComponentValues, ReplaySession, NetworkObserver,
        Engine, Journal, diagnosticSnapshot, parseDraft, normalize, decode, format, copyValue, date, findDto, components };
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }
    if (!root.document) return;
    if (root.DraftHelper) {
        console.warn('[DraftHelper] Уже установлен. Для замены V2 обновите страницу; для V3 вызовите DraftHelper.destroy().');
        return;
    }
    const doc = root.document;
    function plainText(value) {
        // Содержимое template неактивно: внешние ресурсы и исполняемая разметка не добавляются на страницу.
        const template = doc.createElement('template');
        template.innerHTML = String(value ?? '');
        for (const node of template.content.querySelectorAll('script,style,iframe,object,embed')) node.remove();
        for (const node of template.content.querySelectorAll('br')) node.replaceWith(doc.createTextNode('\n'));
        for (const node of template.content.querySelectorAll('p,div,li,h1,h2,h3,h4,tr')) node.append(doc.createTextNode('\n'));
        return (template.content.textContent || '').replace(/\n[ \t]*\n+/g, '\n\n').trim();
    }
    const messages = { 'no-draft': 'Загрузите черновик', unresolved: 'Выберите цикл / элемент; ответ не подставлен',
        missing: 'Ответ отсутствует у выбранного элемента', 'no-value': 'Запись есть, но поле value отсутствует' };
    function el(tag, content, parent) {
        const node = doc.createElement(tag);
        if (content != null) node.textContent = String(content);
        if (parent) parent.append(node);
        return node;
    }
    class PanelView {
        constructor(controller) {
            this.controller = controller; this.selectedEntry = null; this.renderedEntry = null;
            this.ui = null;
        }
        initUI() {
            const host = el('div'); host.id = 'draft-helper-v3';
            host.style.cssText = 'position:fixed;top:60px;right:20px;width:min(680px,calc(100vw - 24px));height:min(740px,calc(100vh - 80px));z-index:2147483647;';
            const shadow = host.attachShadow({ mode: 'open' });
            el('style', `
                :host{color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}
                .panel{background:#f5f7fb;color:#0b1f33;border:1px solid #dbe3ee;border-radius:16px;font:13px/1.55 Inter,system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 20px 65px #0b1f3326;max-height:calc(100vh - 80px);overflow:auto}
                header{display:flex;align-items:center;gap:10px;padding:17px 20px;background:#0d4cd3;color:white;cursor:move;touch-action:none;border-radius:15px 15px 0 0}
                .mark{background:#ffffff;color:#0d4cd3;border-radius:8px;padding:3px 8px;font-size:18px;font-weight:800}.brand{font-size:15px;font-weight:700;letter-spacing:-.3px}.badge{margin-left:auto;font-size:11px;color:#e4edff}
                .content{padding:16px 20px}.toolbar{padding:12px 20px;border-top:1px solid #e1e8ec;display:flex;flex-wrap:wrap;gap:6px;background:white}
                button{font:inherit;font-weight:600;cursor:pointer;border:1px solid #d8e2e7;border-radius:7px;background:white;color:#0b1f33;padding:7px 10px;transition:background .15s}
                button:hover{background:#edf3ff;border-color:#99b6f3}button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid #0d4cd3;outline-offset:2px}
                .file-link{background:none;border:0;color:#0d4cd3;padding:0;font-weight:600;text-decoration:underline;text-underline-offset:3px}.service-source{margin:12px 20px;padding:12px;background:white;border:1px solid #dbe3ee;border-radius:9px}.service-source summary{cursor:pointer}.service-source .prediction{margin-top:12px}.service-source .checks{font-size:12px;overflow-wrap:anywhere}.service-source .checks p{margin:6px 0}.rule-state{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;margin-right:6px;border:1px solid;border-radius:6px;font:800 18px/1 system-ui;vertical-align:middle}.rule-state.matched{color:#146c38;background:#e5f5eb;border-color:#9dd5b1}.rule-state.failed{color:#ac2020;background:#ffeded;border-color:#efb1b1}.rule-state.unknown{color:#805600;background:#fff4ce;border-color:#d8bc62}.prediction-controls{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.prediction-controls button[aria-pressed="true"]{background:#edf3ff;border-color:#0d4cd3}
                .import-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.primary{background:#0d4cd3;color:#fff;border-color:#0d4cd3}.primary:hover{background:#0b3daa;color:white}.quiet{font-size:11px;color:#697b85}
                select,textarea{font:inherit;color:inherit;border:1px solid #d5e0e5;border-radius:8px;background:white;padding:9px;width:100%;margin-top:5px}select:disabled{opacity:.7}label{display:block;font-size:12px;color:#506670;margin:10px 0}
                pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:10px 0;color:#0b1f33}.row{background:white;border:1px solid #e1e9ed;border-radius:10px;padding:14px;margin:10px 0}.row strong{display:block;font-size:13px;font-weight:600;line-height:1.6}
                .source{font-size:11px;overflow-wrap:anywhere;color:#71848e;margin:10px 0}.source summary{cursor:pointer}.screen{font-size:11px;color:#6c808a;overflow-wrap:anywhere;margin:0 0 10px}.hint{font-size:12px;color:#58717b;margin:8px 0}.status{font-size:11px;color:#0d4cd3;margin-top:8px}
                .importer{margin:16px 20px;padding:15px;background:white;border:1px solid #d9e5e9;border-radius:10px}.importer h3{margin:0;font-size:14px}.importer p{font-size:12px;color:#6b7d86;margin:5px 0 10px}textarea{min-height:145px;resize:vertical;font-family:ui-monospace,monospace;font-size:12px}input{max-width:100%;font:inherit;font-size:12px}input::file-selector-button{background:#edf3ff;border:0;border-radius:6px;padding:7px;color:#0d4cd3;cursor:pointer}.error{color:#b93b42;font-size:12px;margin:8px 0}
                .brc-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.brc-values>div{min-width:0}.brc-values pre{max-height:240px;overflow:auto;background:#f5f7fb;padding:8px}.brc-difference{border-left:3px solid #b78300;background:#fff8db;padding:8px;margin:8px 0}.run-list{max-height:350px;overflow:auto;margin-top:10px}.run-step{border-left:5px solid;padding:10px;margin:8px 0;overflow-wrap:anywhere}.run-step strong{display:block}.run-step[data-color="green"]{border-color:#20834b;background:#edf8f0}.run-step[data-color="yellow"]{border-color:#b78300;background:#fff8db}.run-step[data-color="red"]{border-color:#cf3535;background:#fff0f0}.run-step textarea{min-height:55px}.diagnostics{padding:12px 20px 0}.diagnostics>details{background:white;border:1px solid #dbe3ee;border-radius:9px;padding:10px;margin:0 0 8px}.diagnostics summary{cursor:pointer;font-weight:600;overflow-wrap:anywhere}.history-list{max-height:210px;overflow:auto;display:grid;gap:6px;margin:10px 0}.history-list button{text-align:left;white-space:pre-line;font-weight:400;font-size:12px;overflow-wrap:anywhere}.history-list button[aria-pressed="true"]{background:#edf3ff;border-color:#0d4cd3}.diag-controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.diagnostics pre{font:12px/1.55 ui-monospace,Consolas,monospace;max-height:240px;overflow:auto;background:#f5f7fb;border-radius:6px;padding:8px}.diagnostics .row{padding:10px}.archive{border-left:3px solid #0d4cd3;padding-left:9px;margin:10px 0;color:#0d4cd3}.diagnostics .source{color:#506670}.live-caption{font-size:12px;font-weight:600;color:#0d4cd3}
            `, shadow);
            const panel = el('section', null, shadow); panel.className = 'panel'; this.panel = panel;
            panel.style.overscrollBehavior = 'contain';
            const header = el('header', null, panel);
            el('span', '✦', header).className = 'mark';
            el('span', 'DraftHelper', header).className = 'brand';
            this.badge = el('span', 'V3.6.0 · Готов', header); this.badge.className = 'badge';
            this.importer = el('div', null, panel); this.importer.className = 'importer';
            el('h3', 'Загрузить черновик', this.importer);
            const firstLine = el('p', null, this.importer);
            const input = el('input', null, this.importer); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
            this.button('Выберите файл', firstLine, () => input.click()).className = 'file-link';
            firstLine.append(doc.createTextNode(' или вставьте текст черновика.'));
            const pasteLabel = el('label', 'Текст черновика', this.importer);
            this.draftText = el('textarea', null, pasteLabel); this.draftText.placeholder = '{ "body": { "applicantAnswers": … } }';
            this.draftText.spellcheck = false;
            this.importError = el('div', '', this.importer); this.importError.className = 'error'; this.importError.setAttribute('role', 'alert');
            const importActions = el('div', null, this.importer); importActions.className = 'import-actions';
            this.button('Загрузить текст', importActions, () => {
                try { this.controller.setDraft(this.draftText.value); }
                catch { this.importError.textContent = 'Не удалось прочитать черновик. Проверьте JSON и body.applicantAnswers.'; }
            }).className = 'primary';
            this.button('Отмена', importActions, () => { if (this.controller.engine.model) this.importer.hidden = true; });
            input.addEventListener('change', async () => {
                try { const file = input.files[0]; if (file) this.controller.setDraft(await file.text()); }
                catch { this.importError.textContent = 'Не удалось прочитать файл. Проверьте JSON и body.applicantAnswers.'; }
                input.value = '';
            });
            this.sourceDetails = el('details', null, panel); this.sourceDetails.className = 'service-source';
            this.sourceTitle = el('summary', 'Исходник услуги и прогноз · необязательно', this.sourceDetails);
            const sourceFile = el('input', null, this.sourceDetails); sourceFile.type = 'file'; sourceFile.accept = '.json,application/json'; sourceFile.hidden = true;
            const sourceControls = el('div', null, this.sourceDetails); sourceControls.className = 'prediction-controls';
            this.button('Выбрать исходник услуги', sourceControls, () => sourceFile.click());
            this.button('Отключить исходник', sourceControls, () => this.controller.clearService());
            this.sourceError = el('div', '', this.sourceDetails); this.sourceError.className = 'error'; this.sourceError.setAttribute('role', 'alert');
            sourceFile.addEventListener('change', async () => {
                try { const file = sourceFile.files[0]; if (file) this.controller.setService(await file.text(), file.name); }
                catch (error) { this.sourceError.textContent = 'Исходник не загружен: ' + error.message; }
                sourceFile.value = '';
            });
            this.sourceBody = el('div', null, this.sourceDetails);
            const diagnostics = el('div', null, panel); diagnostics.className = 'diagnostics';
            const history = el('details', null, diagnostics);
            this.historyTitle = el('summary', 'Журнал переходов · 0', history);
            el('p', 'Шаги записываются с запуска помощника. Подробные снимки доступны для последних 50 ответов. Просмотр не останавливает страницу. Перед новым прогоном сохраните TXT и очистите журнал.', history).className = 'hint';
            const historyControls = el('div', null, history); historyControls.className = 'diag-controls';
            this.button('Очистить журнал', historyControls, () => {
                this.controller.journal.clear(); this.controller.backRest?.clear(); this.selectedEntry = null; this.renderDiagnostics();
            });
            this.button('Сохранить TXT', historyControls, () => {
                const run = this.currentRun();
                const url = root.URL.createObjectURL(new root.Blob([RunText.stringify(run)], { type: 'text/plain;charset=utf-8' }));
                const link = el('a', null, this.ui || panel); link.href = url; link.download = 'DraftHelper-run.txt'; link.click(); link.remove();
                root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
            });
            el('p', 'Отметки: Проблем нет → Вопрос к DEV → Ошибка. Каждый принятый ответ — отдельный шаг, включая повторные ID. Зелёный не означает автоматическую проверку.', history).className = 'hint';
            this.backRestList = el('div', null, history); this.backRestList.className = 'backrest-list';
            this.runList = el('div', null, history); this.runList.className = 'run-list';
            const runs = el('details', null, diagnostics); el('summary', 'Журнал прогонов', runs);
            const runFile = el('input', null, runs); runFile.type = 'file'; runFile.accept = '.txt,text/plain'; runFile.hidden = true;
            this.button('Загрузить прогон TXT', runs, () => runFile.click());
            const runError = el('p', '', runs); runError.className = 'error'; runError.setAttribute('role', 'alert');
            const archives = el('div', null, runs);
            runFile.addEventListener('change', async () => {
                try {
                    const file = runFile.files[0]; if (!file) return;
                    if (file.size > 10000000) throw new Error('Лимит файла — 10 МБ');
                    const run = RunText.parse(await file.text());
                    const archive = el('details', null, archives); archive.open = true;
                    el('summary', run.service || file.name, archive);
                    el('p', 'Только чтение · ' + run.steps.length + ' шагов', archive).className = 'hint';
                    this.button('Закрыть прогон', archive, () => archive.remove());
                    const list = el('div', null, archive); list.className = 'run-list'; this.drawRun(list, run.steps, true);
                    runError.textContent = '';
                } catch (error) { runError.textContent = 'Прогон не загружен: ' + error.message; }
                runFile.value = '';
            });
            const snapshots = el('details', null, history); el('summary', 'Подробные снимки последних 50 ответов', snapshots);
            this.historyList = el('div', null, snapshots); this.historyList.className = 'history-list';
            snapshots.open = true;
            this.inspector = el('details', null, diagnostics);
            this.inspectorTitle = el('summary', 'Логика экрана · 0', this.inspector);
            this.inspectorBody = el('div', null, this.inspector);
            this.content = el('div', null, panel); this.content.className = 'content';
            const controls = el('div', null, panel); controls.className = 'toolbar';
            this.button('Старт', controls, () => this.controller.toggle(true));
            this.button('Стоп', controls, () => this.controller.toggle(false));
            this.button('Обновить', controls, () => this.render());
            this.button('Новый черновик', controls, () => { this.importer.hidden = false; this.selectPage('data'); this.draftText.focus(); });
            this.button('Удалить помощник', controls, () => this.controller.destroy()).className = 'quiet';
            this.buildNavigation(panel, header, history, runs, snapshots, diagnostics, controls);
            let drag;
            header.addEventListener('pointerdown', e => {
                if (e.button !== 0 || e.target.closest('button')) return;
                const rect = host.getBoundingClientRect(); drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                header.setPointerCapture(e.pointerId);
            });
            header.addEventListener('pointermove', e => {
                if (!drag) return;
                host.style.left = `${Math.max(0, Math.min(root.innerWidth - host.offsetWidth, e.clientX - drag.x))}px`;
                host.style.top = `${Math.max(0, Math.min(root.innerHeight - 40, e.clientY - drag.y))}px`;
                host.style.right = 'auto';
                this.fitPanel();
            });
            header.addEventListener('pointerup', () => { drag = null; });
            header.addEventListener('lostpointercapture', () => { drag = null; });
            (doc.body || doc.documentElement).append(host); this.ui = host;
            this.resizeHandler = () => this.fitPanel();
            root.addEventListener('resize', this.resizeHandler); this.fitPanel();
        }
        buildNavigation(panel, header, history, runs, snapshots, diagnostics, controls) {
            el('style', `
                .panel{height:100%;max-height:none!important;display:flex;flex-direction:column;overflow:hidden;position:relative}
                header{flex:none;padding:12px 16px}.badge{font-size:10px}header button{padding:3px 8px}
                .workspace{display:flex;flex:1;min-height:0;position:relative}.sidebar{width:174px;flex:none;background:#edf3fc;border-right:1px solid #dbe3ee;display:flex;flex-direction:column;padding:8px;gap:6px;overflow:auto}
                .sidebar button{display:flex;align-items:center;gap:10px;white-space:nowrap;text-align:left;background:transparent;border-color:transparent;min-height:38px}
                .sidebar button[aria-current="page"]{background:#dce9ff;color:#0d4cd3;border-color:#b7cef6}.nav-icon{width:22px;flex:none;text-align:center;font-size:18px}.sidebar.collapsed{width:54px;padding:8px 4px}.sidebar.collapsed .nav-label{display:none}
                .sidebar .data-nav{margin-top:auto}.pages{flex:1;min-width:0;min-height:0;position:relative}.page{height:100%;overflow:auto;padding:14px;overscroll-behavior:contain}.page h2{font-size:16px;margin:0 0 12px}
                .page .content,.page .diagnostics{padding:0}.page .importer,.page .service-source{margin:0 0 12px}.page .run-list,.page .history-list{max-height:none}.page .toolbar{padding:8px 0;border:0;background:transparent}
                .page>details{margin:8px 0}.page-status{font-size:11px;color:#58717b;margin-bottom:12px}.panel>.toolbar{flex:none;padding:8px 12px}.resize-handle{position:absolute;z-index:5;touch-action:none}.resize-e{right:0;top:55px;bottom:14px;width:7px;cursor:ew-resize}.resize-s{bottom:0;left:10px;right:14px;height:7px;cursor:ns-resize}.resize-se{right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;color:#58717b}
                .panel.narrow .sidebar:not(.collapsed){position:absolute;inset:0 auto 0 0;z-index:4;box-shadow:8px 0 20px #0b1f3326}.panel.minimized .workspace,.panel.minimized>.toolbar,.panel.minimized .resize-handle{display:none}
            `, panel);
            const workspace = el('div', null, panel); workspace.className = 'workspace';
            panel.insertBefore(workspace, controls);
            this.sidebar = el('nav', null, workspace); this.sidebar.className = 'sidebar'; this.sidebar.setAttribute('aria-label', 'Разделы DraftHelper');
            this.menuButton = this.button('☰', this.sidebar, () => this.setMenu(!this.menuCollapsed));
            this.pages = new Map(); this.navButtons = new Map();
            const pages = el('div', null, workspace); pages.className = 'pages';
            for (const [id, icon, title] of [['hints','◇','Подсказки'],['run','▷','Текущий прогон'],['archive','▤','Архив'],['diagnostics','⌕','Диагностика'],['data','⚙','Данные']]) {
                const button = this.button('', this.sidebar, () => { this.selectPage(id); if (panel.classList.contains('narrow')) this.setMenu(true); });
                button.title = title; button.setAttribute('aria-label', title);
                el('span', icon, button).className = 'nav-icon'; el('span', title, button).className = 'nav-label';
                if (id === 'data') button.className = 'data-nav';
                const page = el('section', null, pages); page.className = 'page'; page.dataset.page = id; page.setAttribute('aria-label', title);
                el('h2', title, page); this.pages.set(id,page); this.navButtons.set(id,button);
            }
            const hints = this.pages.get('hints');
            this.dataStatus = el('div', '', hints); this.dataStatus.className = 'page-status';
            hints.append(this.content);
            const forecast = el('details', null, hints); el('summary', 'Прогноз переходов', forecast); forecast.append(this.sourceBody); forecast.open = true;
            this.pages.get('data').append(this.importer, this.sourceDetails);
            this.sourceTitle.textContent = 'Исходник услуги · необязательно';
            this.button('Загрузить другой черновик', this.pages.get('data'), () => { this.importer.hidden = false; this.draftText.focus(); });
            this.pages.get('run').append(history); history.open = true;
            this.pages.get('archive').append(runs); runs.open = true;
            this.pages.get('diagnostics').append(snapshots, this.inspector); this.inspector.open = true;
            diagnostics.remove();
            const minimize = this.button('−', header, () => {
                this.minimized = !this.minimized;
                if (this.minimized) { this.expandedHeight = this.ui.style.height; this.ui.style.height = (header.getBoundingClientRect().height + 2) + 'px'; }
                else this.ui.style.height = this.expandedHeight;
                panel.classList.toggle('minimized', this.minimized); minimize.textContent = this.minimized ? '+' : '−';
                minimize.setAttribute('aria-label', this.minimized ? 'Развернуть окно' : 'Свернуть окно'); this.fitPanel();
            }); minimize.setAttribute('aria-label', 'Свернуть окно');
            for (const direction of ['e','s','se']) {
                const handle = el('div', direction === 'se' ? '◢' : '', panel); handle.className = 'resize-handle resize-' + direction;
                handle.setAttribute('role','separator'); handle.tabIndex = 0; handle.setAttribute('aria-label','Изменить размер окна ' + direction);
                let start;
                handle.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); const r=this.ui.getBoundingClientRect(); start={x:e.clientX,y:e.clientY,w:r.width,h:r.height}; this.ui.style.left=r.left+'px';this.ui.style.right='auto';handle.setPointerCapture(e.pointerId); });
                handle.addEventListener('pointermove', e => { if (!start) return; this.resizeTo(start.w+(direction.includes('e')?e.clientX-start.x:0),start.h+(direction.includes('s')?e.clientY-start.y:0)); });
                handle.addEventListener('pointerup', () => {start=null;}); handle.addEventListener('lostpointercapture',()=>{start=null;});
                handle.addEventListener('keydown',e=>{ if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return; e.preventDefault();const r=this.ui.getBoundingClientRect(); this.resizeTo(r.width+(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0),r.height+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0)); });
            }
            this.setMenu(false); this.selectPage('data');
        }
        setMenu(collapsed) {
            this.menuCollapsed = collapsed; this.sidebar.classList.toggle('collapsed', collapsed);
            this.menuButton.setAttribute('aria-expanded', String(!collapsed));
            this.menuButton.title = collapsed ? 'Развернуть меню' : 'Свернуть меню'; this.menuButton.setAttribute('aria-label',this.menuButton.title);
        }
        selectPage(id) {
            if (!this.pages?.has(id)) return;
            this.activePage = id;
            for (const [key,page] of this.pages) { page.hidden = key !== id; this.navButtons.get(key).setAttribute('aria-current',key===id?'page':'false'); }
        }
        resizeTo(width,height) {
            const rect=this.ui.getBoundingClientRect();
            this.ui.style.width=Math.min(Math.max(340,width),root.innerWidth-rect.left-8)+'px';
            this.ui.style.height=Math.min(Math.max(260,height),root.innerHeight-rect.top-8)+'px';this.fitPanel();
        }
        fitPanel() {
            if (!this.ui || !this.panel) return;
            const rect=this.ui.getBoundingClientRect();
            const width=Math.max(1,Math.min(rect.width,root.innerWidth-16));
            const height=Math.max(1,Math.min(rect.height,root.innerHeight-16));
            this.ui.style.width=width+'px';this.ui.style.height=height+'px';
            this.ui.style.left=Math.max(8,Math.min(rect.left,root.innerWidth-width-8))+'px';
            this.ui.style.top=Math.max(8,Math.min(rect.top,root.innerHeight-height-8))+'px';this.ui.style.right='auto';
            const narrow=width<560;
            if (narrow && !this.panel.classList.contains('narrow')) this.setMenu(true);
            this.panel.classList.toggle('narrow',narrow);
        }
        button(title, parent, fn) {
            const b = el('button', title, parent); b.type = 'button';
            b.addEventListener('click', fn); return b;
        }
        currentRun() {
            const source = this.controller.serviceDefinition;
            const dto = this.controller.engine.dto;
            return { service: plainText(source?.serviceName || dto?.serviceName || source?.passport || dto?.serviceCode || 'Услуга не указана'),
                steps: this.controller.journal.steps.map(step => ({ ...step,
                    name: plainText(step.name || source?.screens.get(step.id)?.name || '') })) };
        }
        drawRun(parent, steps, readonly = false, offset = 0) {
            const labels = { green: 'Проблем нет', yellow: 'Вопрос к DEV', red: 'Ошибка при тестировании' };
            steps.forEach((step, i) => {
                i += offset;
                const row = el('div', null, parent); row.className = 'run-step'; row.dataset.color = step.color;
                el('strong', `${i + 1}. ${step.id}` + (step.name ? ' · ' + plainText(step.name) : ''), row);
                if (readonly) {
                    el('p', labels[step.color], row);
                    if (step.comment) el('p', step.comment, row).style.whiteSpace = 'pre-wrap';
                } else {
                    const mark = this.button(labels[step.color], row, () => {
                        step.color = runColors[(runColors.indexOf(step.color) + 1) % 3];
                        row.dataset.color = step.color; mark.textContent = labels[step.color];
                    });
                    mark.title = 'Изменить отметку шага';
                    const label = el('label', 'Комментарий к шагу ' + (i + 1), row);
                    const comment = el('textarea', null, label); comment.value = step.comment; comment.rows = 2;
                    comment.addEventListener('input', () => { step.comment = comment.value; });
                }
            });
        }
        renderBackRest() {
            if (!this.backRestList) return;
            const tracker = this.controller.backRest;
            if (!tracker) { this.backRestList.replaceChildren(); el('p','Для наблюдения BackRestCall подключите исходник услуги в разделе «Данные».',this.backRestList).className='hint'; this.backRestRendered=null; return; }
            const stamp = [tracker, tracker.events.length, tracker.events.at(-1), this.controller.engine.model, tracker.message];
            if (this.backRestRendered?.every((value,i)=>value===stamp[i])) return;
            this.backRestRendered=stamp;
            const open = new Set([...this.backRestList.querySelectorAll('details[open]')].map(n=>n.dataset.eventKey));
            this.backRestList.replaceChildren();
            el('h3','Результаты BackRestCall',this.backRestList);
            if (tracker.message) el('p',tracker.message,this.backRestList).className='error';
            if (!tracker.events.length) el('p','Новых результатов пока нет. Наблюдение начинается после подключения исходника.',this.backRestList).className='hint';
            el('p','Последние 100 событий. Повторный вызов с тем же значением не обнаруживается. В TXT значения BackRestCall не включаются.',this.backRestList).className='hint';
            const screenLabel = screen => { const name=plainText(screen.name || tracker.definition.screens.get(screen.id)?.name || '');return name ? `${name} (${screen.id})` : screen.id; };
            for (const event of [...tracker.events].reverse()) {
                const card=el('details',null,this.backRestList);card.className='row backrest-event';
                card.dataset.eventKey=JSON.stringify([event.step?.number,event.id,event.cycleId,event.itemId]);card.open=open.has(card.dataset.eventKey);
                const kind={initial:'Присутствовало при начале наблюдения',appeared:'Появился результат',changed:'Значение изменилось'}[event.kind];
                el('summary',`${event.id} · ${kind}`,card);
                el('p',event.step ? `Обнаружено на шаге ${event.step.number}: ${screenLabel(event.step)}` : 'Обнаружено в текущем ответе',card);
                if (event.cycleId) el('p',`Цикл: ${event.cycleId} · текущий элемент: ${event.itemId}`,card).className='hint';
                el('p','В исходнике объявлен на: ' + (event.screens.map(s=>screenLabel(s)+(s.type?' · '+s.type:'')).join('; ') || 'экран не найден'),card).className='hint';
                el('p',event.kind==='initial' ? 'Вызов до начала наблюдения не подтверждён.' : event.observed.length ? 'Экраны с объявлением наблюдались на шагах: '+event.observed.map(s=>`${s.number} — ${screenLabel(s)}`).join('; ')+'. Это связь по последовательности ответов, а не подтверждение источника вызова.' : 'Экран вызова не наблюдался.',card).className='hint';
                const compare=el('div',null,card);
                const draw = (record, unavailable) => {
                    compare.replaceChildren();
                    const grid=el('div',null,compare);grid.className='brc-values';
                    const column=(title,value,parent)=>{const col=el('div',null,parent);el('strong',title,col);el('pre',text(value),col);this.button('Копировать '+title.toLowerCase(),col,async()=>{try{await root.navigator.clipboard.writeText(text(value));}catch{el('p','Копирование недоступно; выделите текст вручную.',col);}});};
                    column('Текущее значение',event.value,grid);
                    if (!record?.hasValue) el('p',unavailable || 'В черновике значение отсутствует',grid);
                    else {
                        column('Значение из черновика',record.value,grid);
                        const differences=valueDiff(event.value,record.value);
                        if (differences.length) {
                            const block=el('details',null,compare);el('summary','Различающиеся поля (до 100)',block);
                            for(const diff of differences){const row=el('div',null,block);row.className='brc-difference';el('strong',diff.path,row);el('pre','Текущее: '+diff.current+'\nЧерновик: '+diff.draft,row);}
                        }
                    }
                };
                const model=this.controller.engine.model;
                if (event.cycleId) {
                    const cycle=model?.cycles.get(event.cycleId);
                    if (!cycle) draw(null,model?'В черновике значение отсутствует':'Загрузите черновик для сравнения');
                    else {
                        const label=el('label','Элемент исходного черновика для сравнения',card);const select=el('select',null,label);
                        const empty=el('option','Выберите элемент',select);empty.value='';
                        cycle.items.forEach((item,i)=>{const option=el('option',`Элемент ${i+1}`,select);option.value=String(i);});
                        if (event.compareModel!==model) {event.compareModel=model;event.comparePosition=null;}
                        const refresh=()=>{draw(event.comparePosition==null?null:cycle.items[event.comparePosition]?.answers.get(event.id),event.comparePosition==null?'Выберите элемент исходного черновика':null);};
                        select.value=event.comparePosition==null?'':String(event.comparePosition);
                        select.addEventListener('change',()=>{event.comparePosition=select.value===''?null:Number(select.value);refresh();});refresh();
                    }
                } else draw(model?.globals.get(event.id),model?null:'Загрузите черновик для сравнения');
                card.append(compare);
            }
        }
        renderDiagnostics() {
            if (this.controller.disposed || !this.historyList) return;
            this.renderBackRest();
            // При поступлении ответов сохраняем редакторы комментариев, чтобы не терять фокус и введённый текст.
            const steps = this.controller.journal.steps;
            for (const step of steps) if (!step.name) step.name = plainText(this.controller.serviceDefinition?.screens.get(step.id)?.name || '');
            if (this.runSteps !== steps || this.runLength !== steps.length) {
                this.runSteps = steps; this.runLength = steps.length;
                if (!steps.length) this.runList.replaceChildren();
                else {
                    const count = this.runList.children.length;
                    this.drawRun(this.runList, steps.slice(count), false, count);
                    [...this.runList.children].forEach((row, i) => {
                        const step = steps[i];
                        row.querySelector('strong').textContent = `${i + 1}. ${step.id}` + (step.name ? ' · ' + plainText(step.name) : '');
                    });
                }
            }
            if (this.dataStatus) this.dataStatus.textContent = `${this.controller.engine.model ? '● Черновик загружен' : 'Черновик не загружен'} · ${this.controller.serviceDefinition ? 'Исходник подключён' : 'Без исходника'}`;
            this.historyTitle.textContent = `Журнал переходов · ${steps.length}`;
            this.historyList.replaceChildren();
            if (!this.controller.journal.entries.length) el('div', 'Пока нет записей.', this.historyList).className = 'hint';
            for (const entry of [...this.controller.journal.entries].reverse()) {
                const time = new Date(entry.time).toLocaleTimeString('ru-RU', { hour12: false });
                const title = `#${entry.number} · ${time} · ${entry.transport.toUpperCase()}\n${entry.screenId} · ${entry.screenType}` +
                    `${entry.hidden ? ' · Redirect' : ''}${!entry.applied ? ' · запоздавший ответ' : ''}`;
                const button = this.button(title, this.historyList, () => {
                    this.selectedEntry = entry; this.inspector.open = true; this.selectPage('diagnostics'); this.renderDiagnostics();
                });
                button.setAttribute('aria-pressed', String(this.selectedEntry === entry));
            }
            const entry = this.selectedEntry || this.controller.liveEntry;
            this.inspectorTitle.textContent = entry ?
                `${this.selectedEntry ? 'Запись #' + entry.number : 'Логика текущего ответа'} · компонентов: ${entry.logicCount}` : 'Логика экрана · 0';
            if (this.renderedEntry === entry && this.renderedIsArchive === !!this.selectedEntry) return;
            this.renderedEntry = entry; this.renderedIsArchive = !!this.selectedEntry;
            this.inspectorBody.replaceChildren();
            if (!entry) { el('p', 'Ожидается ответ сценария. Загрузка черновика для журнала не требуется.', this.inspectorBody).className = 'hint'; return; }
            el('p', this.selectedEntry ? 'Архивная запись. Страница продолжает работать; подсказки ниже относятся к текущему экрану.' :
                'Снимок последнего принятого ответа текущего прохождения.', this.inspectorBody).className = this.selectedEntry ? 'archive' : 'hint';
            if (this.selectedEntry) this.button('К текущему ответу', this.inspectorBody, () => { this.selectedEntry = null; this.renderDiagnostics(); });
            el('strong', `${entry.screenId} · ${entry.screenType}`, this.inspectorBody);
            if (entry.screenName) el('p', plainText(entry.screenName), this.inspectorBody);
            el('p', `${entry.transport.toUpperCase()} · ${new Date(entry.time).toLocaleTimeString('ru-RU')} · ` +
                (entry.hidden ? 'Невидимый экран (Redirect)' : 'Без Redirect') +
                (entry.status != null ? ` · HTTP ${entry.status}` : ''), this.inspectorBody).className = 'hint';
            if (!entry.applied) el('p', 'Ответ пришёл после более нового запроса. Сохранён в журнале, но не заменил текущие подсказки.', this.inspectorBody).className = 'hint';
            if (entry.truncated) el('p', 'Крупные данные сокращены: лимит 100 компонентов и около 64 000 символов значений на запись.', this.inspectorBody).className = 'hint';
            const describe = (label, value, parent, open = false) => {
                const details = el('details', null, parent); details.className = 'source'; details.open = open;
                el('summary', label, details); el('pre', value, details);
            };
            describe('Запрос и контекст цикла', `URL: ${entry.url || '(не передан)'}\nУслуга: ${entry.serviceCode}\nЗаявка: ${entry.orderId}\nСценарий: ${entry.scenario}\n${entry.cycle}`, this.inspectorBody);
            describe('Компоненты display', entry.fields.map(c => `${c.id} · ${c.type}` +
                (c.actions !== undefined ? `\nДействия:\n${c.actions}` : '')).join('\n\n') || '(нет компонентов)', this.inspectorBody);
            if (!entry.logicCount) el('p', 'В logicComponents этого ответа нет компонентов.', this.inspectorBody).className = 'hint';
            for (const c of entry.logic) {
                const row = el('div', null, this.inspectorBody); row.className = 'row';
                el('strong', `${c.id} · ${c.type}`, row);
                if (c.name) el('div', plainText(c.name), row);
                describe('Аргументы компонента · arguments', c.arguments, row, true);
                describe('Значение компонента · value', c.value, row);
                describe('Ответ текущего прохождения · applicantAnswers', c.applicantAnswer, row);
                describe('Кэш текущего прохождения · cachedAnswers', c.cachedAnswer, row);
                describe('Ответ активного элемента цикла · itemAnswers', c.cycleAnswer, row);
                describe('Атрибуты компонента · attrs', c.attrs, row);
            }
        }
        render() {
            if (this.controller.disposed || !this.content) return;
            const ctx = this.controller.engine.context();
            const key = JSON.stringify([this.controller.engine.dto?.orderId, this.controller.engine.dto?.currentScenarioId,
                this.controller.engine.dto?.display?.id, ctx.token, ctx.position, this.controller.enabled]);
            const scrollContainer = this.pages?.get('hints') || this.panel;
            const scrollTop = scrollContainer.scrollTop;
            const preserve = this.renderKey === key;
            this.renderKey = key;
            try { this.renderSource(); this.renderContent(); }
            finally { this.fitPanel(); scrollContainer.scrollTop = preserve ? scrollTop : 0; }
        }
        renderSource() {
            if (!this.sourceBody) return;
            this.sourceBody.replaceChildren();
            const source = this.controller.serviceDefinition;
            this.sourceTitle.textContent = source ? 'Исходник услуги подключён · прогноз' : 'Исходник услуги и прогноз · необязательно';
            if (!source) { el('p', 'Подключите JSON услуги с screens, applicationFields и правилами переходов.', this.sourceBody).className = 'hint'; return; }
            el('strong', source.name, this.sourceBody);
            el('p', `${source.screens.size} экранов · ${source.fields.size} компонентов · версия: ${source.version ?? 'не указана в JSON'}`, this.sourceBody).className = 'hint';
            if (source.warnings.length) el('p', `Замечаний к описанию: ${source.warnings.length}. ${source.warnings.slice(0, 3).join('; ')}`, this.sourceBody).className = 'hint';
            const modes = el('div', null, this.sourceBody); modes.className = 'prediction-controls';
            for (const [mode, label] of [['live', 'По текущим ответам'], ['draft', 'По исходному черновику']]) {
                const button = this.button(label, modes, () => { this.controller.predictionMode = mode; this.renderSource(); });
                button.setAttribute('aria-pressed', String(this.controller.predictionMode === mode));
            }
            el('p', this.controller.predictionMode === 'live' ? 'Прогноз по последнему сетевому ответу. Ещё не отправленный ввод не учитывается.' :
                'Прогноз по сохранённому черновику; он может отличаться от текущего прохождения. Для цикла выберите элемент черновика в подсказках ниже.', this.sourceBody).className = 'hint';
            try {
                const forecast = new TransitionPredictor(source).predict(this.controller.engine, this.controller.predictionMode);
                el('p', forecast.message, this.sourceBody).className = 'hint';
                for (const group of forecast.groups) {
                    const block = el('div', null, this.sourceBody); block.className = 'prediction';
                    el('strong', group.label, block);
                    const targetName = target => {
                        if (target == null) return 'nextDisplay = null (служебный переход без указанного экрана)';
                        const name = plainText(source.screens.get(target)?.name || '').trim();
                        return name ? `${name} (${target})` : target;
                    };
                    const labels = { expected: `Ожидается: ${targetName(group.target)}`, possible: 'Есть возможные переходы; однозначного прогноза нет',
                        'no-rules': 'Правил для этого экрана нет', 'no-match': 'Ни одно условие перехода не выполнено' };
                    el('p', labels[group.status], block).className = 'status';
                    if (group.contextUnknown) el('p', 'В ответе не указан inCycle; набор правил выбран предварительно.', block).className = 'hint';
                    for (const rule of group.rules) {
                        const details = el('details', null, block); details.className = 'checks';
                        const summary = el('summary', null, details);
                        const state = rule.state === true ? 'matched' : rule.state === false ? 'failed' : 'unknown';
                        const label = { matched: 'Условия выполнены', failed: 'Условия не выполнены', unknown: 'Недостаточно данных' }[state];
                        const badge = el('span', rule.state === true ? '✓' : rule.state === false ? '✗' : '?', summary);
                        badge.className = 'rule-state ' + state; badge.title = label; badge.setAttribute('aria-label', label);
                        summary.append(doc.createTextNode(` Правило ${rule.number} → ${targetName(rule.target)}`));
                        if (rule.initializer) el('p', 'cycleInitializer = true', details);
                        if (!rule.checks.length) el('p', 'Нет условий (безусловное правило).', details);
                        for (const check of rule.checks) el('p', `${check.state === true ? '✓' : check.state === false ? '✗' : '?'} ${check.reason}${check.origin ? ' · ' + check.origin : ''}`, details);
                    }
                    el('p', group.table + '.' + this.controller.engine.dto.display.id, block).className = 'source';
                }
            } catch { el('p', 'Не удалось вычислить прогноз. Обычные подсказки продолжают работать.', this.sourceBody).className = 'error'; }
        }
        renderContent() {
            if (this.controller.disposed || !this.content) return;
            this.content.replaceChildren();
            this.badge.textContent = this.controller.enabled ? 'V3.6.0 · Активен' : 'V3.6.0 · Подсказки на паузе';
            this.renderDiagnostics();
            if (!this.controller.enabled) { el('p', 'Подсказки остановлены. Журнал продолжает записывать ответы.', this.content); return; }
            if (!this.controller.engine.model) { el('p', 'Загрузите черновик или вызовите DraftHelper.setDraft(draft)', this.content); return; }
            const display = this.controller.engine.dto?.display;
            if (!display) { el('p', 'Черновик загружен. Ожидается переход на экран услуги.', this.content); return; }
            el('div', 'Подсказки текущего экрана', this.content).className = 'live-caption';
            const screenName = plainText(display.name || this.controller.serviceDefinition?.screens.get(display.id)?.name || '');
            if (screenName) el('strong', screenName, this.content);
            el('p', `${display.id ?? 'unknown'} · ${display.type ?? ''}${components(display).some(c => c.type === 'Redirect') ? ' · Невидимый экран' : ''}`, this.content).className = 'screen';
            const ctx = this.controller.engine.context();
            el('div', ctx.initializing && ctx.position === undefined ? 'Обзор элементов на стартовом экране цикла' : ctx.reason, this.content).className = 'hint';
            const cycleLabel = el('label', 'Цикл: ', this.content);
            const select = el('select', null, cycleLabel);
            const empty = el('option', 'Автоматически / вне цикла', select); empty.value = '';
            for (const c of this.controller.engine.model.cycles.values()) { const o = el('option', c.id, select); o.value = c.id; }
            select.value = ctx.cycleId ?? ''; select.disabled = ctx.active || (this.controller.engine.dto?.cycledApplicantAnswers?.inCycle === false && !ctx.initializing);
            select.addEventListener('change', () => this.controller.selectCycle(select.value));
            if (ctx.cycle) {
                const label = el('label', 'Элемент исходного черновика: ', this.content);
                const itemSelect = el('select', null, label);
                const none = el('option', ctx.initializing ? 'Все элементы — обзор полей экрана' : '— выберите элемент —', itemSelect); none.value = '';
                for (const item of ctx.cycle.items) {
                    const o = el('option', `${item.position + 1} из ${ctx.cycle.items.length} · index=${item.index}`, itemSelect);
                    o.value = String(item.position);
                }
                itemSelect.value = ctx.position === undefined ? '' : String(ctx.position); itemSelect.disabled = ctx.conflict;
                itemSelect.addEventListener('change', () => this.controller.selectItem(itemSelect.value === '' ? null : Number(itemSelect.value)));
                if (ctx.initializing && ctx.position === undefined) el('div', 'Показаны поля этого экрана для всех элементов исходного черновика.', this.content).className = 'hint';
                else if (ctx.liveId == null && ctx.liveIndex == null) el('div', 'Нет идентификатора текущего элемента: переключайте элемент вручную при следующей итерации.', this.content);
            } else if (ctx.active) el('p', 'Активный цикл не найден в исходном черновике.', this.content);

            const fields = components(display);
            const preview = ctx.initializing && ctx.cycle && ctx.position === undefined;
            const entries = preview ? [
                ...fields.filter(c => !c.cycleScope).map(c => ({ c })),
                ...ctx.cycle.items.flatMap(item => fields.filter(c => c.cycleScope === ctx.cycleId)
                    .map(c => ({ c, position: item.position }))),
                ...fields.filter(c => c.cycleScope && c.cycleScope !== ctx.cycleId).map(c => ({ c }))
            ] : fields.map(c => ({ c }));
            let lastPosition;
            for (const { c, position } of entries) {
                if (c.type === 'Redirect') continue;
                if (this.controller.engine.model.cycles.has(c.id) && !c.cycleScope) continue;
                if (c.type === 'InfoScr' && !this.controller.engine.model.globals.has(c.id) && !this.controller.engine.model.owners.has(c.id)) continue;
                if (position !== undefined && position !== lastPosition) {
                    el('h3', `Элемент ${position + 1} из ${ctx.cycle.items.length}`, this.content);
                    lastPosition = position;
                }
                const result = this.controller.engine.resolve(c.id, c.cycleScope, position);
                const row = el('div', null, this.content); row.className = 'row';
                el('strong', plainText(c.title || c.label || c.name || c.id), row);
                if (result.status !== 'found') { el('div', messages[result.status], row); continue; }
                const formatted = ComponentValues.format(c, result.answer.raw);
                el('pre', plainText(formatted), row);
                const source = el('details', null, row); source.className = 'source';
                el('summary', 'Источник ответа', source); el('div', result.source, source);
                this.button('Копировать', row, async () => {
                    try {
                        await root.navigator.clipboard.writeText(ComponentValues.copy(c, result.answer.raw));
                    } catch { el('div', 'Копирование недоступно; выделите текст вручную.', row); }
                });
            }
        }
        dispose() {
            root.removeEventListener('resize', this.resizeHandler);
            this.ui?.remove(); this.selectedEntry = null; this.renderedEntry = null;
        }
    }

    class Controller {
        constructor() {
            this.version = '3.6.0'; this.serviceDefinition = null; this.backRest = null; this.predictionMode = 'live'; this.enabled = true; this.disposed = false; this.draft = null;
            this.session = new ReplaySession(); this.panelView = new PanelView(this);
            this.network = new NetworkObserver(root, (...args) => this.process(...args),
                () => this.session.nextTicket(), code => this.report(code));
        }
        get engine() { return this.session.engine; }
        get journal() { return this.session.journal; }
        get liveEntry() { return this.session.liveEntry; }
        get pendingXHR() { return this.network.pendingXHR; }
        // Свойства совместимости для работы через консоль и регрессионных проверок.
        get ui() { return this.panelView.ui; }
        get panel() { return this.panelView.panel; }
        get selectedEntry() { return this.panelView.selectedEntry; }
        set selectedEntry(entry) { this.panelView.selectedEntry = entry; }
        setService(input, name = '') {
            if (this.disposed) throw new Error('Помощник удалён');
            const definition = new ServiceDefinition(input, name);
            this.serviceDefinition = definition; this.backRest = new BackRestTracker(definition);
            if (this.engine.dto) this.backRest.observe(this.engine.dto,this.liveEntry?.step);
            this.panelView.sourceError.textContent = '';
            this.panelView.sourceDetails.open = true; this.render(); return this;
        }
        clearService() {
            this.serviceDefinition = null; this.backRest = null; this.panelView.sourceError.textContent = ''; this.render();
        }
        setDraft(input) {
            if (this.disposed) throw new Error('Помощник удалён. Запустите файл заново.');
            const parsed = DraftModel.parse(input);
            this.engine.setDraft(parsed); this.draft = parsed;
            const view = this.panelView; view.renderKey = null;
            if (view.importer) { view.importer.hidden = true; view.draftText.value = ''; view.importError.textContent = ''; }
            view.selectPage('hints'); this.render(); return this;
        }
        toggle(force) { this.enabled = typeof force === 'boolean' ? force : !this.enabled; this.render(); }
        selectCycle(id) { this.engine.selectCycle(id); this.render(); }
        selectItem(position) { this.engine.selectItem(position); this.render(); }
        setScope(id, scope) {
            if (scope != null && scope !== 'global' && !this.engine.model?.cycles.has(scope)) throw new Error('Неизвестная область');
            if (scope == null) this.engine.scopeOverrides.delete(id); else this.engine.scopeOverrides.set(id, scope);
            this.render();
        }
        process(payload, sequence, metadata = {}) {
            if (this.disposed) return;
            const outcome = this.session.ingest(payload, sequence, metadata);
            if (!outcome) return;
            if (outcome.diagnosticsError) this.report('Ошибка журнала; состояние прохождения обновлено');
            if (outcome.applied && this.backRest) {
                try { this.backRest.observe(this.engine.dto,outcome.entry?.step); }
                catch { this.report('Не удалось обработать результат BackRestCall'); }
            }
            if (outcome.applied) this.render(); else this.renderDiagnostics();
        }
        render() { if (!this.disposed) this.panelView.render(); }
        renderDiagnostics() { if (!this.disposed) this.panelView.renderDiagnostics(); }
        fitPanel() { if (!this.disposed) this.panelView.fitPanel(); }
        report(code) { console.warn(`[DraftHelper] ${code}`); }
        start() {
            try { this.panelView.initUI(); this.network.start(); this.render(); }
            catch (error) { this.destroy(); throw error; }
        }
        destroy() {
            if (this.disposed) return;
            this.disposed = true;
            this.network.stop(); this.panelView.dispose(); this.session.clear(); this.draft = null; this.serviceDefinition = null; this.backRest = null;
            if (root.DraftHelper === this) delete root.DraftHelper;
        }
    }
    const helper = new Controller();
    helper.start(); root.DraftHelper = helper;
})(typeof window !== 'undefined' ? window : globalThis);