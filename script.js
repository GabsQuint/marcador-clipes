// Use Project URL e Publishable key. NÃO use service_role e NÃO use Direct connection string.
const SUPABASE_URL = 'https://coaxojxclxpxrumsptqx.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_McTZJCF3QwwO08nfe5ic-A_lUjYPrL-'


const USER_KEY = 'marcador_clipes_nome'

const userNameInput = document.getElementById('userName')
const filterDateInput = document.getElementById('filterDate')
const filterBox = document.getElementById('filterBox')
const exportBtn = document.getElementById('exportBtn')
const clipsList = document.getElementById('clipsList')
const deleteBtn = document.getElementById('deleteBtn')
const markBtn = document.getElementById('markBtn')
const connectionNotice = document.getElementById('connectionNotice')
const ceoStatus = document.getElementById('ceoStatus')

let db = null
let clipsCache = []
let ceoAuthenticated = false
let ceoPasswordSession = ''

function pad(value) {
  return String(value).padStart(2, '0')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateBR(dateKey) {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

function formatLocalDateBR(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getUserName() {
  return userNameInput.value.trim()
}

function isCEOName() {
  return getUserName().toUpperCase() === 'CEO'
}

function isCEOAuthenticated() {
  return isCEOName() && ceoAuthenticated === true
}

async function requestCEOLogin() {
  if (!isCEOName()) {
    ceoAuthenticated = false
    ceoPasswordSession = ''
    return false
  }

  if (!db) {
    alert('Supabase ainda não está configurado no código.')
    return false
  }

  if (isCEOAuthenticated()) return true

  const password = prompt('Login do CEO: digite a senha')

  if (!password) {
    ceoAuthenticated = false
    ceoPasswordSession = ''
    return false
  }

  const { data, error } = await db.rpc('verify_ceo_password', {
    password_input: password
  })

  if (error) {
    console.error(error)
    alert(`Erro ao validar senha do CEO: ${error.message}`)
    ceoAuthenticated = false
    ceoPasswordSession = ''
    return false
  }

  if (data === true) {
    ceoAuthenticated = true
    ceoPasswordSession = password
    setTodayFilterForCEO()
    alert('CEO autenticado com sucesso.')
    return true
  }

  ceoAuthenticated = false
  ceoPasswordSession = ''
  alert('Senha incorreta. Você será alterado para usuário comum.')
  userNameInput.value = ''
  localStorage.removeItem(USER_KEY)
  return false
}

function updatePermissions() {
  const ceo = isCEOAuthenticated()

  filterBox.classList.toggle('hidden', !ceo)
  exportBtn.classList.toggle('hidden', !ceo)
  deleteBtn.classList.toggle('hidden', !ceo)
  ceoStatus.classList.toggle('hidden', !ceo)
}

function validateSupabaseConfig() {
  const isConfigured =
    SUPABASE_URL !== 'COLE_AQUI_PROJECT_URL' &&
    SUPABASE_PUBLISHABLE_KEY !== 'COLE_AQUI_PUBLISHABLE_KEY' &&
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_PUBLISHABLE_KEY.length > 20

  if (!isConfigured) {
    connectionNotice.textContent = 'Falta colocar o Project URL e a Publishable key do Supabase dentro do arquivo script.js.'
    connectionNotice.classList.add('warning')
    markBtn.disabled = true
    return false
  }

  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  connectionNotice.textContent = 'Conectado ao Supabase. Os horários ficam em uma lista única online.'
  connectionNotice.classList.remove('warning')
  markBtn.disabled = false
  return true
}

async function registerClip() {
  const userName = getUserName()

  if (!userName) {
    alert('Digite seu nome antes de marcar o clipe.')
    userNameInput.focus()
    return
  }

  if (isCEOName() && !isCEOAuthenticated()) {
    const logged = await requestCEOLogin()
    updatePermissions()

    if (!logged) return
  }

  if (!db) {
    alert('Supabase ainda não está configurado no código.')
    return
  }

  localStorage.setItem(USER_KEY, userName)

  markBtn.disabled = true
  markBtn.textContent = 'SALVANDO...'

  const now = new Date()

  const { error } = await db
    .from('clips')
    .insert({
      user_name: userName,
      client_clicked_at: now.toISOString()
    })

  markBtn.disabled = false
  markBtn.textContent = 'MARCAR CLIPE AGORA'

  if (error) {
    console.error(error)
    alert('Erro ao salvar no Supabase. Confira se a tabela e as policies foram criadas.')
    return
  }

  await loadClips()
}

function getSelectedDateRange() {
  if (!filterDateInput.value) return null

  const start = new Date(`${filterDateInput.value}T00:00:00`)
  const end = new Date(`${filterDateInput.value}T23:59:59.999`)

  return {
    start: start.toISOString(),
    end: end.toISOString()
  }
}

async function loadClips() {
  if (!db) return

  updatePermissions()
  clipsList.innerHTML = '<p class="empty">Carregando horários...</p>'

  let query = db
    .from('clips')
    .select('id, user_name, client_clicked_at, created_at')
    .order('client_clicked_at', { ascending: false })

  const range = isCEOAuthenticated() ? getSelectedDateRange() : null

  if (range) {
    query = query
      .gte('client_clicked_at', range.start)
      .lte('client_clicked_at', range.end)
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    clipsList.innerHTML = '<p class="empty">Erro ao carregar horários. Confira a tabela e as policies no Supabase.</p>'
    return
  }

  clipsCache = data || []
  renderClips()
}

async function deleteClip(id) {
  if (!isCEOAuthenticated()) {
    alert('Somente CEO autenticado pode excluir horários.')
    return
  }

  if (!db) return

  const confirmed = confirm('Excluir este horário?')
  if (!confirmed) return

  const { error } = await db.rpc('delete_clip_by_ceo', {
    password_input: ceoPasswordSession,
    clip_id_input: id
  })

  if (error) {
    console.error(error)
    alert('Erro ao excluir. Confira se a função delete_clip_by_ceo foi criada no Supabase.')
    return
  }

  await loadClips()
}

async function deleteAllVisible() {
  if (!isCEOAuthenticated()) {
    alert('Somente CEO autenticado pode excluir horários.')
    return
  }

  if (!db) return

  if (clipsCache.length === 0) {
    alert('Nenhum horário exibido para excluir.')
    return
  }

  const message = filterDateInput.value
    ? `Tem certeza que deseja excluir todos os horários exibidos do dia ${formatDateBR(filterDateInput.value)}?`
    : 'Tem certeza que deseja excluir todos os horários exibidos?'

  const confirmed = confirm(message)
  if (!confirmed) return

  const ids = clipsCache.map(clip => clip.id)

  const { error } = await db.rpc('delete_clips_by_ceo', {
    password_input: ceoPasswordSession,
    clip_ids_input: ids
  })

  if (error) {
    console.error(error)
    alert('Erro ao excluir os horários exibidos. Confira se a função delete_clips_by_ceo foi criada no Supabase.')
    return
  }

  await loadClips()
}

function exportTxt() {
  if (!isCEOAuthenticated()) {
    alert('Somente CEO autenticado pode exportar os horários.')
    return
  }

  if (clipsCache.length === 0) {
    alert('Nenhum horário marcado ainda.')
    return
  }

  const grouped = clipsCache.reduce((acc, clip) => {
    const clickDate = new Date(clip.client_clicked_at)
    const day = formatDateKey(clickDate)

    if (!acc[day]) acc[day] = []
    acc[day].push(clip)
    return acc
  }, {})

  let content = 'MARCADOR DE CLIPES DO FUTEBOL\n'
  content += '================================\n\n'

  if (filterDateInput.value) {
    content += `FILTRO: ${formatDateBR(filterDateInput.value)}\n\n`
  }

  Object.keys(grouped).sort().forEach(day => {
    content += `DIA ${formatDateBR(day)}\n`
    content += '--------------------------------\n'

    grouped[day]
      .sort((a, b) => new Date(a.client_clicked_at) - new Date(b.client_clicked_at))
      .forEach((clip, index) => {
        const clickDate = new Date(clip.client_clicked_at)
        const realTime = formatTime(clickDate)

        content += `${index + 1}. ${realTime} | Pessoa: ${clip.user_name}\n`
      })

    content += '\n'
  })

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `horarios-clipes-${formatDateKey(new Date())}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

function setTodayFilterForCEO() {
  if (isCEOAuthenticated() && !filterDateInput.value) {
    filterDateInput.value = formatDateKey(new Date())
  }
}

function clearDateFilter() {
  filterDateInput.value = ''
  loadClips()
}

function changeUser() {
  localStorage.removeItem(USER_KEY)
  ceoAuthenticated = false
  ceoPasswordSession = ''
  userNameInput.value = ''
  userNameInput.focus()
  clipsCache = []
  renderClips()
  loadClips()
}

function renderClips() {
  updatePermissions()

  const clips = [...clipsCache].sort((a, b) => new Date(b.client_clicked_at) - new Date(a.client_clicked_at))
  const ceo = isCEOAuthenticated()

  if (clips.length === 0) {
    clipsList.innerHTML = '<p class="empty">Nenhum horário marcado ainda.</p>'
    return
  }

  clipsList.innerHTML = clips.map(clip => {
    const clickDate = new Date(clip.client_clicked_at)

    return `
      <article class="clip-item">
        <div class="clip-header">
          <strong>${formatLocalDateBR(clickDate)} - ${formatTime(clickDate)}</strong>
          ${ceo ? '<span class="tag">CEO</span>' : ''}
        </div>
        <p class="small">Marcado por: ${escapeHtml(clip.user_name)}</p>
        ${ceo ? `<br><button class="danger" onclick="deleteClip('${clip.id}')">Excluir este horário</button>` : ''}
      </article>
    `
  }).join('')
}

async function loadInitialData() {
  const savedUser = localStorage.getItem(USER_KEY)

  if (savedUser) {
    userNameInput.value = savedUser
  } else {
    const name = prompt('Digite seu nome:')
    if (name) {
      userNameInput.value = name.trim()
      localStorage.setItem(USER_KEY, name.trim())
    }
  }

  userNameInput.addEventListener('change', async () => {
    localStorage.setItem(USER_KEY, getUserName())
    ceoAuthenticated = false
    ceoPasswordSession = ''

    if (isCEOName()) {
      await requestCEOLogin()
    }

    renderClips()
    await loadClips()
  })

  userNameInput.addEventListener('input', () => {
    if (!isCEOName()) {
      ceoAuthenticated = false
      ceoPasswordSession = ''
    }
    updatePermissions()
  })

  filterDateInput.addEventListener('input', () => {
    loadClips()
  })

  if (validateSupabaseConfig()) {
    if (isCEOName()) {
      await requestCEOLogin()
    }

    await loadClips()
  } else {
    renderClips()
  }
}

loadInitialData()
