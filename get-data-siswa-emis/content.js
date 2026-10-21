/**
 * EMIS Data Siswa Scraper - Content Script
 * Listens for student detail API captures, manages floating toast notifications,
 * and handles manual DOM extraction on EMIS detail page.
 */

(() => {
    'use strict';

    // Inject interceptor into document head to ensure it runs even if injected later
    function injectInterceptor() {
        if (document.querySelector('script[data-emis-interceptor]')) return;
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('interceptor.js');
            script.setAttribute('data-emis-interceptor', 'true');
            (document.head || document.documentElement).appendChild(script);
            script.onload = () => script.remove();
        } catch (e) {
            // Ignore if already loaded via manifest
        }
    }
    injectInterceptor();

    // ==================== TOAST NOTIFICATION UI ====================
    let toastContainer = null;

    function createToastContainer() {
        if (toastContainer && document.body.contains(toastContainer)) return toastContainer;

        toastContainer = document.createElement('div');
        toastContainer.id = 'emis-scraper-toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 380px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    function showToast(title, message, type = 'success') {
        const container = createToastContainer();
        const toast = document.createElement('div');
        
        const bgColors = {
            success: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            info: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            warning: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
            error: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
        };

        toast.style.cssText = `
            background: ${bgColors[type] || bgColors.success};
            color: #ffffff;
            padding: 14px 18px;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: flex-start;
            gap: 12px;
            font-size: 14px;
            line-height: 1.4;
            pointer-events: auto;
            transform: translateX(120%);
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
            opacity: 0;
        `;

        toast.innerHTML = `
            <div style="font-size: 20px; flex-shrink: 0; line-height: 1;">
                ${type === 'success' ? '✅' : type === 'info' ? 'ℹ️' : type === 'warning' ? '⚠️' : '❌'}
            </div>
            <div style="flex-grow: 1;">
                <div style="font-weight: 700; font-size: 15px; margin-bottom: 2px;">${escapeHtml(title)}</div>
                <div style="font-size: 13px; opacity: 0.95;">${escapeHtml(message)}</div>
            </div>
        `;

        container.appendChild(toast);

        // Slide in animation
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==================== DATA NORMALIZER ====================
    function normalizeStudentDataFromJSON(raw) {
        if (!raw) return null;
        const res = raw.results || raw.data || raw;

        const getVal = (val, defaultVal = '-') => {
            if (val === null || val === undefined || val === '') return defaultVal;
            if (typeof val === 'object') {
                if (val.name !== undefined && val.name !== null) return String(val.name).replace(/\s+/g, ' ').trim() || defaultVal;
                if (val.label !== undefined && val.label !== null) return String(val.label).replace(/\s+/g, ' ').trim() || defaultVal;
                if (val.title !== undefined && val.title !== null) return String(val.title).replace(/\s+/g, ' ').trim() || defaultVal;
                if (val.value !== undefined && val.value !== null) return String(val.value).replace(/\s+/g, ' ').trim() || defaultVal;
                if (val.description !== undefined && val.description !== null) return String(val.description).replace(/\s+/g, ' ').trim() || defaultVal;
                if (val.status !== undefined && val.status !== null) return String(val.status).replace(/\s+/g, ' ').trim() || defaultVal;
                if (val.text !== undefined && val.text !== null) return String(val.text).replace(/\s+/g, ' ').trim() || defaultVal;

                // Try finding first string property in object
                for (const k of Object.keys(val)) {
                    if (typeof val[k] === 'string' && val[k].trim() && k !== 'id') {
                        return val[k].replace(/\s+/g, ' ').trim();
                    }
                }
                return defaultVal;
            }
            const str = String(val).replace(/\s+/g, ' ').trim();
            if (str === '[object Object]') return defaultVal;
            return str || defaultVal;
        };

        const learning = res.learning_activity || {};
        const studyGroup = learning.study_group || {};
        const academicYear = learning.academic_year || {};
        const studentStatus = learning.student_status || {};
        const statusDesc = learning.status_description || {};

        const parents = res.parents || {};
        const fatherJob = parents.father_job || parents.father_m_job || {};
        const fatherEdu = parents.father_last_education || {};
        const fatherStatus = parents.father_life_status || parents.father_m_life_status || parents.father_status || {};
        const fatherIncome = parents.father_average_income_per_month || {};

        const motherJob = parents.mother_job || parents.mother_m_job || {};
        const motherEdu = parents.mother_last_education || {};
        const motherStatus = parents.mother_life_status || parents.mother_m_life_status || parents.mother_status || {};
        const motherIncome = parents.mother_average_income_per_month || {};

        const waliJob = parents.wali_job || parents.wali_m_job || {};
        const waliEdu = parents.wali_last_education || {};
        const waliStatus = parents.wali_life_status || parents.wali_m_life_status || parents.wali_status || parents.wali || {};
        const waliIncome = parents.wali_average_income_per_month || {};

        let disabilities = '-';
        if (Array.isArray(res.student_disabilities) && res.student_disabilities.length > 0) {
            disabilities = res.student_disabilities.map(d => getVal(d)).join(', ');
        } else if (res.m_disabilities) {
            disabilities = getVal(res.m_disabilities);
        }

        return {
            id: getVal(res.id || res.siswa_id),
            siswa_id: getVal(res.siswa_id || res.id),
            
            full_name: getVal(res.full_name),
            nik: getVal(res.nik),
            nisn: getVal(res.nisn),
            local_nis: getVal(res.local_nis),
            gender: getVal(res.gender || res.m_gender),
            birth_place: getVal(res.birth_place),
            birth_date: getVal(res.birth_date),
            religion: getVal(res.m_religion),
            life_goal: getVal(res.m_life_goal),
            hobby: getVal(res.m_hobby),
            child_of_num: getVal(res.child_of_num),
            siblings_num: getVal(res.siblings_num),
            
            residence_status: getVal(res.m_residence_status),
            address: getVal(res.address),
            full_address: getVal(res.full_address),
            rt: getVal(res.rt),
            rw: getVal(res.rw),
            postal_code: getVal(res.postal_code_num || res.postal_code),
            province: getVal(res.m_province),
            city: getVal(res.m_city),
            district: getVal(res.m_district),
            sub_district: getVal(res.m_sub_district),
            
            handphone: getVal(res.handphone),
            email: getVal(res.email),
            residence_distance: getVal(res.m_residence_distance),
            interval_time: getVal(res.m_interval_time),
            transportation: getVal(res.m_transportation),
            special_need: getVal(res.m_special_need),
            disability: getVal(disabilities),
            fund_source: getVal(res.m_fund_source),
            nomor_kip: getVal(res.nomor_kip),
            kk_num: getVal(res.kk_num),
            family_head_name: getVal(res.family_head_name),
            
            study_group_name: getVal(studyGroup.name || studyGroup.room_name || learning.study_group_name),
            room_name: getVal(studyGroup.room_name),
            level: getVal(studyGroup.level || learning.level),
            teacher_name: getVal(studyGroup.teacher_name),
            academic_year: getVal(academicYear.name || learning.academic_year_name),
            student_status: getVal(studentStatus.name || learning.student_status_name),
            status_description: getVal(statusDesc.name || learning.status_description_name),
            absent_number: getVal(learning.absent_number),
            admission_date: getVal(learning.admission_date || res.admission_date),
            nsm_lembaga: getVal(learning.nsm_lembaga || learning.institution_name),
            major: getVal(learning.major),

            father_full_name: getVal(parents.father_full_name),
            father_nik: getVal(parents.father_nik),
            father_birth_place: getVal(parents.father_birth_place),
            father_birth_date: getVal(parents.father_birth_date),
            father_life_status: getVal(fatherStatus),
            father_job: getVal(fatherJob),
            father_last_education: getVal(fatherEdu),
            father_income: getVal(fatherIncome),
            father_domicile: getVal(parents.father_domicile),
            father_phone: getVal(parents.father_phone_number || parents.father_phone),
            father_address: getVal(parents.father_address),
            father_residence_status: getVal(parents.father_residence_status),

            mother_full_name: getVal(parents.mother_full_name),
            mother_nik: getVal(parents.mother_nik),
            mother_birth_place: getVal(parents.mother_birth_place),
            mother_birth_date: getVal(parents.mother_birth_date),
            mother_life_status: getVal(motherStatus),
            mother_job: getVal(motherJob),
            mother_last_education: getVal(motherEdu),
            mother_income: getVal(motherIncome),
            mother_domicile: getVal(parents.mother_domicile),
            mother_phone: getVal(parents.mother_phone_number || parents.mother_phone),
            mother_address: getVal(parents.mother_address),
            mother_residence_status: getVal(parents.mother_residence_status),

            wali: getVal(parents.wali),
            wali_full_name: getVal(parents.wali_full_name),
            wali_nik: getVal(parents.wali_nik),
            wali_birth_place: getVal(parents.wali_birth_place),
            wali_birth_date: getVal(parents.wali_birth_date),
            wali_life_status: getVal(waliStatus),
            wali_job: getVal(waliJob),
            wali_last_education: getVal(waliEdu),
            wali_income: getVal(waliIncome),
            wali_domicile: getVal(parents.wali_domicile),
            wali_phone: getVal(parents.wali_phone_number || parents.wali_phone),
            wali_address: getVal(parents.wali_address),
            wali_residence_status: getVal(parents.wali_residence_status),

            timestamp: new Date().toISOString()
        };
    }

    // Cache last recorded student to prevent duplicate immediate toasts
    let lastCapturedId = null;

    // ==================== EVENT LISTENER (MAIN WORLD API INTERCEPTOR) ====================
    window.addEventListener('EMIS_STUDENT_DETAIL_CAPTURED', (event) => {
        try {
            const rawData = event.detail?.data;
            if (!rawData) return;

            const student = normalizeStudentDataFromJSON(rawData);
            if (!student || !student.full_name || student.full_name === '-') return;

            const uniqueId = student.id || student.siswa_id || student.nik;
            if (uniqueId === lastCapturedId) return;
            lastCapturedId = uniqueId;

            showToast(
                'Data Siswa Terekam! ✅',
                `${student.full_name} (NIK: ${student.nik !== '-' ? student.nik : student.nisn})`
            );

            // Send to background / sidebar
            chrome.runtime.sendMessage({
                type: 'STUDENT_DATA',
                data: student,
                source: 'api_interceptor'
            }).catch(() => {});

        } catch (e) {
            console.error('[EMIS Scraper] Error handling intercepted detail:', e);
        }
    });

    // ==================== DOM FALLBACK SCRAPER ====================
    function scrapeDOMDetail() {
        const student = {
            id: 'DOM_' + Date.now(),
            siswa_id: '-',
            full_name: '-',
            nik: '-',
            nisn: '-',
            local_nis: '-',
            gender: '-',
            birth_place: '-',
            birth_date: '-',
            religion: '-',
            life_goal: '-',
            hobby: '-',
            child_of_num: '-',
            siblings_num: '-',
            residence_status: '-',
            address: '-',
            full_address: '-',
            rt: '-',
            rw: '-',
            postal_code: '-',
            province: '-',
            city: '-',
            district: '-',
            sub_district: '-',
            handphone: '-',
            email: '-',
            residence_distance: '-',
            interval_time: '-',
            transportation: '-',
            special_need: '-',
            disability: '-',
            fund_source: '-',
            nomor_kip: '-',
            kk_num: '-',
            family_head_name: '-',
            
            study_group_name: '-',
            room_name: '-',
            level: '-',
            teacher_name: '-',
            academic_year: '-',
            student_status: '-',
            status_description: '-',
            absent_number: '-',
            admission_date: '-',
            nsm_lembaga: '-',
            major: '-',

            father_full_name: '-',
            father_nik: '-',
            father_birth_place: '-',
            father_birth_date: '-',
            father_life_status: '-',
            father_job: '-',
            father_last_education: '-',
            father_income: '-',
            father_domicile: '-',
            father_phone: '-',
            father_address: '-',
            father_residence_status: '-',

            mother_full_name: '-',
            mother_nik: '-',
            mother_birth_place: '-',
            mother_birth_date: '-',
            mother_life_status: '-',
            mother_job: '-',
            mother_last_education: '-',
            mother_income: '-',
            mother_domicile: '-',
            mother_phone: '-',
            mother_address: '-',
            mother_residence_status: '-',

            wali_full_name: '-',
            wali_nik: '-',
            wali_birth_place: '-',
            wali_birth_date: '-',
            wali_life_status: '-',
            wali_job: '-',
            wali_last_education: '-',
            wali_income: '-',
            wali_domicile: '-',
            wali_phone: '-',
            wali_address: '-',
            wali_residence_status: '-',

            timestamp: new Date().toISOString()
        };

        const cleanVal = (val) => {
            if (!val) return '-';
            const str = String(val).replace(/\s+/g, ' ').trim();
            return str || '-';
        };

        // Helper function to extract key-value pairs from a section element
        const extractFieldsFromSection = (sectionEl) => {
            const fields = {};
            const rowEls = sectionEl.querySelectorAll('.css-1dbjc4n.r-18u37iz');
            rowEls.forEach(row => {
                const children = Array.from(row.children);
                let labelText = '';
                let valueText = '';

                const testIdValue = row.querySelector('[data-testid="text-address-value"]');
                if (testIdValue) {
                    valueText = testIdValue.textContent.trim();
                    if (children.length >= 1) {
                        labelText = children[0].textContent.trim();
                    }
                } else if (children.length >= 3) {
                    labelText = children[0].textContent.trim();
                    valueText = children[2].textContent.trim();
                }

                labelText = labelText.toUpperCase().replace(/\s+/g, ' ').trim();
                if (labelText && labelText !== ':' && valueText) {
                    fields[labelText] = cleanVal(valueText);
                }
            });
            return fields;
        };

        const textNameEls = document.querySelectorAll('[data-testid="text-name"]');
        if (textNameEls && textNameEls.length > 0) {
            textNameEls.forEach(headerDiv => {
                const titleText = headerDiv.textContent.trim();
                let sectionContainer = headerDiv.parentElement;
                if (sectionContainer && sectionContainer.classList.contains('r-18u37iz')) {
                    sectionContainer = sectionContainer.parentElement;
                }

                if (!sectionContainer) return;

                const fields = extractFieldsFromSection(sectionContainer);
                const titleLower = titleText.toLowerCase();

                if (titleLower.includes('ayah')) {
                    if (fields['NAMA LENGKAP']) student.father_full_name = fields['NAMA LENGKAP'];
                    if (fields['NIK']) student.father_nik = fields['NIK'];
                    if (fields['TEMPAT LAHIR']) student.father_birth_place = fields['TEMPAT LAHIR'];
                    if (fields['TANGGAL LAHIR']) student.father_birth_date = fields['TANGGAL LAHIR'];
                    if (fields['STATUS']) student.father_life_status = fields['STATUS'];
                    if (fields['PENDIDIKAN TERAKHIR']) student.father_last_education = fields['PENDIDIKAN TERAKHIR'];
                    if (fields['PEKERJAAN UTAMA']) student.father_job = fields['PEKERJAAN UTAMA'];
                    if (fields['DOMISILI']) student.father_domicile = fields['DOMISILI'];
                    if (fields['NO HANDPHONE'] || fields['NO. HANDPHONE']) student.father_phone = fields['NO HANDPHONE'] || fields['NO. HANDPHONE'];
                    if (fields['PENGHASILAN RATA-RATA PER BULAN (RP)'] || fields['PENGHASILAN RATA-RATA PER BULAN']) student.father_income = fields['PENGHASILAN RATA-RATA PER BULAN (RP)'] || fields['PENGHASILAN RATA-RATA PER BULAN'];
                    if (fields['ALAMAT']) student.father_address = fields['ALAMAT'];
                    if (fields['STATUS TEMPAT TINGGAL']) student.father_residence_status = fields['STATUS TEMPAT TINGGAL'];
                } else if (titleLower.includes('ibu')) {
                    if (fields['NAMA LENGKAP']) student.mother_full_name = fields['NAMA LENGKAP'];
                    if (fields['NIK']) student.mother_nik = fields['NIK'];
                    if (fields['TEMPAT LAHIR']) student.mother_birth_place = fields['TEMPAT LAHIR'];
                    if (fields['TANGGAL LAHIR']) student.mother_birth_date = fields['TANGGAL LAHIR'];
                    if (fields['STATUS']) student.mother_life_status = fields['STATUS'];
                    if (fields['PENDIDIKAN TERAKHIR']) student.mother_last_education = fields['PENDIDIKAN TERAKHIR'];
                    if (fields['PEKERJAAN UTAMA']) student.mother_job = fields['PEKERJAAN UTAMA'];
                    if (fields['DOMISILI']) student.mother_domicile = fields['DOMISILI'];
                    if (fields['NO HANDPHONE'] || fields['NO. HANDPHONE']) student.mother_phone = fields['NO HANDPHONE'] || fields['NO. HANDPHONE'];
                    if (fields['PENGHASILAN RATA-RATA PER BULAN (RP)'] || fields['PENGHASILAN RATA-RATA PER BULAN']) student.mother_income = fields['PENGHASILAN RATA-RATA PER BULAN (RP)'] || fields['PENGHASILAN RATA-RATA PER BULAN'];
                    if (fields['ALAMAT']) student.mother_address = fields['ALAMAT'];
                    if (fields['STATUS TEMPAT TINGGAL']) student.mother_residence_status = fields['STATUS TEMPAT TINGGAL'];
                } else if (titleLower.includes('wali') && !titleLower.includes('biayai')) {
                    if (fields['NAMA LENGKAP']) student.wali_full_name = fields['NAMA LENGKAP'];
                    if (fields['NIK']) student.wali_nik = fields['NIK'];
                    if (fields['TEMPAT LAHIR']) student.wali_birth_place = fields['TEMPAT LAHIR'];
                    if (fields['TANGGAL LAHIR']) student.wali_birth_date = fields['TANGGAL LAHIR'];
                    if (fields['STATUS']) student.wali_life_status = fields['STATUS'];
                    if (fields['PENDIDIKAN TERAKHIR']) student.wali_last_education = fields['PENDIDIKAN TERAKHIR'];
                    if (fields['PEKERJAAN UTAMA']) student.wali_job = fields['PEKERJAAN UTAMA'];
                    if (fields['DOMISILI']) student.wali_domicile = fields['DOMISILI'];
                    if (fields['NO HANDPHONE'] || fields['NO. HANDPHONE']) student.wali_phone = fields['NO HANDPHONE'] || fields['NO. HANDPHONE'];
                    if (fields['PENGHASILAN RATA-RATA PER BULAN (RP)'] || fields['PENGHASILAN RATA-RATA PER BULAN']) student.wali_income = fields['PENGHASILAN RATA-RATA PER BULAN (RP)'] || fields['PENGHASILAN RATA-RATA PER BULAN'];
                    if (fields['ALAMAT']) student.wali_address = fields['ALAMAT'];
                    if (fields['STATUS TEMPAT TINGGAL']) student.wali_residence_status = fields['STATUS TEMPAT TINGGAL'];
                } else if (titleLower.includes('aktivitas belajar')) {
                    const dataRows = sectionContainer.querySelectorAll('.r-tvv088 .r-18u37iz');
                    dataRows.forEach(row => {
                        const cols = Array.from(row.children).map(c => cleanVal(c.textContent));
                        if (cols.length >= 7) {
                            student.academic_year = cols[0] !== '-' ? cols[0] : student.academic_year;
                            student.admission_date = cols[1] !== '-' ? cols[1] : student.admission_date;
                            student.nsm_lembaga = cols[2] !== '-' ? cols[2] : student.nsm_lembaga;
                            student.study_group_name = cols[3] !== '-' ? cols[3] : student.study_group_name;
                            student.major = cols[4] !== '-' ? cols[4] : student.major;
                            student.student_status = cols[5] !== '-' ? cols[5] : student.student_status;
                            student.status_description = cols[6] !== '-' ? cols[6] : student.status_description;
                        }
                    });
                } else if (!titleLower.includes('beasiswa') && !titleLower.includes('prestasi')) {
                    const titleValueEl = headerDiv.querySelector('[data-testid="text-name-value"]') || headerDiv;
                    const nameVal = cleanVal(titleValueEl.textContent);
                    if (nameVal && nameVal !== '-') {
                        student.full_name = nameVal;
                    }

                    if (fields['NIK']) student.nik = fields['NIK'];
                    if (fields['NISN']) student.nisn = fields['NISN'];
                    if (fields['KIP'] || fields['NO. KIP'] || fields['NOMOR KIP']) student.nomor_kip = fields['KIP'] || fields['NO. KIP'] || fields['NOMOR KIP'];
                    if (fields['TEMPAT LAHIR']) student.birth_place = fields['TEMPAT LAHIR'];
                    if (fields['TANGGAL LAHIR']) student.birth_date = fields['TANGGAL LAHIR'];
                    if (fields['JENIS KELAMIN']) student.gender = fields['JENIS KELAMIN'];
                    if (fields['AGAMA']) student.religion = fields['AGAMA'];
                    if (fields['JUMLAH SAUDARA']) student.siblings_num = fields['JUMLAH SAUDARA'];
                    if (fields['ANAK KE']) student.child_of_num = fields['ANAK KE'];
                    if (fields['HOBI']) student.hobby = fields['HOBI'];
                    if (fields['CITA-CITA']) student.life_goal = fields['CITA-CITA'];
                    if (fields['NO. HANDPHONE'] || fields['NO HANDPHONE']) student.handphone = fields['NO. HANDPHONE'] || fields['NO HANDPHONE'];
                    if (fields['ALAMAT EMAIL SISWA'] || fields['EMAIL']) student.email = fields['ALAMAT EMAIL SISWA'] || fields['EMAIL'];
                    if (fields['YANG MEMBIAYAI SEKOLAH']) student.fund_source = fields['YANG MEMBIAYAI SEKOLAH'];
                    if (fields['KEBUTUHAN DISABILITAS'] || fields['DISABILITAS']) student.disability = fields['KEBUTUHAN DISABILITAS'] || fields['DISABILITAS'];
                    if (fields['KEBUTUHAN KHUSUS']) student.special_need = fields['KEBUTUHAN KHUSUS'];
                    if (fields['ALAMAT']) student.address = fields['ALAMAT'];
                    if (fields['STATUS TEMPAT TINGGAL']) student.residence_status = fields['STATUS TEMPAT TINGGAL'];
                    if (fields['JARAK TEMPAT TINGGAL - MADRASAH'] || fields['JARAK TEMPAT TINGGAL']) student.residence_distance = fields['JARAK TEMPAT TINGGAL - MADRASAH'] || fields['JARAK TEMPAT TINGGAL'];
                    if (fields['WAKTU TEMPUH']) student.interval_time = fields['WAKTU TEMPUH'];
                    if (fields['TRANSPORTASI KE SEKOLAH'] || fields['TRANSPORTASI']) student.transportation = fields['TRANSPORTASI KE SEKOLAH'] || fields['TRANSPORTASI'];
                }
            });
        }

        // Generic fallback if text-name is not found (legacy EMIS layout fallback)
        if (student.full_name === '-') {
            const findField = (labels) => {
                const elements = document.querySelectorAll('div, span, td, th, p');
                for (const label of labels) {
                    for (const el of elements) {
                        if (el.children.length === 0 && el.textContent.trim().toLowerCase() === label.toLowerCase()) {
                            let next = el.nextElementSibling || el.parentElement?.nextElementSibling;
                            if (next && next.textContent.trim()) {
                                return cleanVal(next.textContent);
                            }
                        }
                    }
                }
                return '-';
            };

            student.full_name = findField(['Nama Lengkap', 'Nama Siswa', 'Nama']);
            student.nik = findField(['NIK', 'No. NIK', 'Nomor Induk Kependudukan']);
            student.nisn = findField(['NISN', 'No. NISN']);
            student.gender = findField(['Jenis Kelamin', 'Gender']);
            student.birth_place = findField(['Tempat Lahir']);
            student.birth_date = findField(['Tanggal Lahir']);
            student.address = findField(['Alamat', 'Alamat Jalan']);
            student.study_group_name = findField(['Rombel', 'Kelas', 'Rombongan Belajar']);
            student.father_full_name = findField(['Nama Ayah', 'Nama Ayah Kandung']);
            student.mother_full_name = findField(['Nama Ibu', 'Nama Ibu Kandung']);
            student.wali_full_name = findField(['Nama Wali', 'Nama Wali Kandung']);
        }

        return student;
    }

    // ==================== MESSAGING HANDLER ====================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'PING') {
            sendResponse({ status: 'alive' });
            return true;
        }

        if (message.action === 'MANUAL_SCRAPE_CURRENT_PAGE') {
            const domData = scrapeDOMDetail();
            if (domData.full_name && domData.full_name !== '-') {
                showToast(
                    'Rekam Manual Berhasil! ✅',
                    `${domData.full_name}`
                );
                chrome.runtime.sendMessage({
                    type: 'STUDENT_DATA',
                    data: domData,
                    source: 'dom_manual'
                }).catch(() => {});
                sendResponse({ status: 'success', data: domData });
            } else {
                showToast(
                    'Gagal Rekam DOM ⚠️',
                    'Buka halaman detail siswa di EMIS terlebih dahulu',
                    'warning'
                );
                sendResponse({ status: 'not_found' });
            }
            return true;
        }

        return true;
    });

    console.log('[EMIS Scraper] Content Script ready');
})();
