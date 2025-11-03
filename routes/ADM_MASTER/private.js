import express from 'express'
import bcrypt from 'bcrypt'
import supabase from '../../supabase.js'

const route = express.Router()

// Função para validar campos obrigatórios
function validarCampos(campos, body) {
  for (const campo of campos) {
    if (!body[campo]) return campo
  }
  return null
}

async function criarNotificacao({
  matricula_funcionario = null,
  tipo_notificacao = 'GENÉRICA',
  mensagem = '',
  matricula_responsavel = null
}) {
  try {
    const { error } = await supabase.from('notificacoes').insert([
      {
        matricula_funcionario,
        tipo_notificacao,
        mensagem,
        matricula_responsavel,
        lida: false,
        enviada_em: new Date().toISOString()
      }
    ])
    if (error) {
      // não interrompe a operação principal, apenas loga
      console.error('Erro ao criar notificação:', error)
    }
  } catch (err) {
    console.error('Erro inesperado ao criar notificação:', err)
  }
}

//contabilizar funcionarios por setor para grafico
route.get('/contabilizarFuncionariosSetor', async (req, res) => {
  try {
    // buscar todos os funcionários trazendo id_setor e relacionamento setor.nome_setor
    const { data, error } = await supabase.from('funcionario').select('id_setor, setor(nome_setor)')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar funcionários', erro: error })
    }

    // agregar contagem por setor (funcionários sem setor aparecem como "Sem setor" com id_setor = null)
    const mapa = new Map()
    for (const f of data || []) {
      const id = f.id_setor ?? null
      const nome = f.setor?.nome_setor ?? 'Sem setor'
      const key = id === null ? 'null' : String(id)

      if (!mapa.has(key)) {
        mapa.set(key, { id_setor: id, nome_setor: nome, quantidade: 0 })
      }
      mapa.get(key).quantidade += 1
    }

    const contagem = Array.from(mapa.values())
    return res.status(200).json(contagem)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

//listar quipes
route.get('/listarEquipes_master', async (req, res) => {
  try {
    const { data, error } = await supabase.from('equipe').select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar equipes', erro: error })
    }

    res.status(200).json({ equipes: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// listar regioes
route.get('/listarRegioes_master', async (req, res) => {
  try {
    const { data, error } = await supabase.from('regiao').select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar regiões', erro: error })
    }

    res.status(200).json({ regioes: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Cadastrar Funcionário
route.post('/cadastrarFuncionario_master', async (req, res) => {
  try {
    const {
      matricula_funcionario,
      nome,
      email,
      telefone,
      cargo,
      setor,
      status_permissao,
      equipe,
      regiao
    } = req.body

    if (
      !matricula_funcionario ||
      !nome ||
      !email ||
      !telefone ||
      !cargo ||
      !setor ||
      !status_permissao ||
      !equipe ||
      !regiao
    ) {
      return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios' })
    }

    //verificar se matricula possui 5 digitos
    if (String(req.body.matricula_funcionario).length !== 5) {
      return res.status(400).json({ mensagem: 'A matrícula deve conter exatamente 5 dígitos' })
    }

    const senha = matricula_funcionario.toString()

    // Criptografar senha
    const salt = await bcrypt.genSalt(10)
    const senhaHash = await bcrypt.hash(senha, salt)

    // Verificar se matrícula já existe
    const { data: funcionarioExistente } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (funcionarioExistente) {
      return res.status(400).json({ mensagem: 'Matrícula já cadastrada' })
    }

    // buscar setor para associar ao funcionário
    const { data: setorData, error: setorError } = await supabase
      .from('setor')
      .select('id_setor')
      .eq('nome_setor', setor)
      .maybeSingle()

    if (setorError || !setorData) {
      return res.status(400).json({ mensagem: 'Setor não encontrado', erro: setorError })
    }

    //buscar equipe do setor para associar ao funcionário
    const { data: equipeData, error: equipeError } = await supabase
      .from('equipe')
      .select('id_equipe')
      .eq('nome_equipe', equipe)
      .eq('id_setor', setorData.id_setor)
      .maybeSingle()

    if (equipeError) {
      return res.status(400).json({ mensagem: 'Erro ao buscar equipe', erro: equipeError })
    } else if (!equipeData) {
      const { data: novaEquipeData, error: novaEquipeError } = await supabase
        .from('equipe')
        .insert([{ nome_equipe: equipe, id_setor: setorData.id_setor }])
        .select()
        .maybeSingle()

      if (novaEquipeError) {
        return res
          .status(400)
          .json({ mensagem: 'Erro ao criar nova equipe', erro: novaEquipeError })
      }

      equipeData.id_equipe = novaEquipeData.id_equipe
    }

    //buscar regiao e se nao existir criar outra
    const { data: regiaoData, error: regiaoError } = await supabase
      .from('regiao')
      .select('id_regiao')
      .eq('nome_regiao', regiao)
      .maybeSingle()

    if (regiaoError) {
      return res.status(400).json({ mensagem: 'Erro ao buscar regiao', erro: regiaoError })
    } else if (!regiaoData) {
      const { data: novaregiaoData, error: novaregiaoError } = await supabase
        .from('regiao')
        .insert([{ nome_regiao: regiao }])
        .select()
        .maybeSingle()

      if (novaregiaoError) {
        return res
          .status(400)
          .json({ mensagem: 'Erro ao criar nova regiao', erro: novaregiaoError })
      }

      regiaoData.id_regiao = novaregiaoData.id_regiao
    }

    // Inserir funcionário
    const { data, error } = await supabase
      .from('funcionario')
      .insert([
        {
          matricula_funcionario: matricula_funcionario,
          nome: nome,
          email: email,
          senha: senhaHash,
          telefone: telefone,
          cargo: cargo,
          id_equipe: equipeData.id_equipe,
          id_regiao: regiaoData.id_regiao,
          id_setor: setorData.id_setor,
          status_permissao: status_permissao
        }
      ])
      .select()

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao inserir dados', erro: error })
    }

    res.status(201).json({ mensagem: 'Funcionário cadastrado com sucesso', funcionario: data[0] })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Listar Funcionários
route.get('/listarFuncionarios_master', async (req, res) => {
  try {
    const { data, error } = await supabase.from('funcionario').select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar funcionários', erro: error })
    }

    res.status(200).json({ funcionarios: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Editar funcionário (dados e permissão, sem senha)
route.put('/editarFuncionario_master/:matricula_funcionario', async (req, res) => {
  try {
    const { matricula_funcionario } = req.params
    const { email, telefone, cargo, setor, status_permissao, equipe, regiao } = req.body

    const { data: funcionarioDesatualizado } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (!funcionarioDesatualizado) {
      console.log('Funcionário não encontrado.')
      return res.status(404).json({ mensagem: 'Funcionário não encontrado' })
    }

    let id_setor = funcionarioDesatualizado.id_setor
    if (setor) {
      const { data: setorData, error: setorError } = await supabase
        .from('setor')
        .select('id_setor')
        .eq('nome_setor', setor)
        .maybeSingle()

      if (setorError || !setorData) {
        console.log('Setor não encontrado:', setor)
        return res.status(400).json({ mensagem: 'Setor não encontrado', erro: setorError })
      }

      id_setor = setorData.id_setor
    }

    //verificar se equipe existe no setor do funcionário e atualizar se necessário
    const { data: equipeData, error: equipeError } = await supabase
      .from('equipe')
      .select('id_equipe')
      .eq('nome_equipe', equipe)
      .eq('id_setor', id_setor)
      .maybeSingle()

    if (equipeError) {
      console.log('Erro ao buscar equipe:', equipeError)
      return res.status(400).json({ mensagem: 'Erro ao buscar equipe', erro: equipeError })
    } else if (equipe && !equipeData) {
      console.log('Equipe não encontrada no setor:', equipe)
      return res.status(400).json({ mensagem: 'Equipe não encontrada no setor' })
    }

    // verificar regiao e atualizar se necessário
    let id_regiao = funcionarioDesatualizado.id_regiao
    if (regiao) {
      const { data: regiaoData, error: regiaoError } = await supabase
        .from('regiao')
        .select('id_regiao')
        .eq('nome_regiao', regiao)
        .maybeSingle()

      if (regiaoError) {
        console.log('Erro ao buscar regiao:', regiaoError)
        return res.status(400).json({ mensagem: 'Erro ao buscar regiao', erro: regiaoError })
      } else if (!regiaoData) {
        console.log('Regiao não encontrada:', regiao)
        return res.status(400).json({ mensagem: 'Regiao não encontrada' })
      }
      id_regiao = regiaoData.id_regiao
    }

    const payloadToUpdate = {
      email: email !== undefined ? email : funcionarioDesatualizado.email,
      telefone: telefone !== undefined ? telefone : funcionarioDesatualizado.telefone,
      cargo: cargo !== undefined ? cargo : funcionarioDesatualizado.cargo,
      id_setor: id_setor,
      status_permissao:
        status_permissao !== undefined
          ? status_permissao
          : funcionarioDesatualizado.status_permissao,
      id_equipe: equipeData ? equipeData.id_equipe : funcionarioDesatualizado.equipe,
      id_regiao: id_regiao
    }

    const { data: funcionarioAtualizado, error } = await supabase
      .from('funcionario')
      .update(payloadToUpdate)
      .eq('matricula_funcionario', matricula_funcionario)
      .select('email, telefone, cargo, status_permissao, setor(nome_setor)')
      .maybeSingle()

    if (error) {
      console.log('Erro ao atualizar funcionário:', error)
      return res.status(400).json({ mensagem: 'Erro ao atualizar funcionário', erro: error })
    }

    return res.status(200).json({
      mensagem: 'Funcionário atualizado com sucesso',
      funcionario: funcionarioAtualizado[0]
    })
  } catch (error) {
    console.error('Erro inesperado:', error)
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Deletar Funcionário
route.delete('/deletarFuncionario_master/:matricula_funcionario', async (req, res) => {
  try {
    const { matricula_funcionario } = req.params

    // apaga as notificacoes do funcoinario primeiro
    const { error: notifError } = await supabase
      .from('notificacoes')
      .delete()
      .eq('matricula_funcionario', matricula_funcionario)

    if (notifError) {
      return res.status(400).json({ mensagem: 'Erro ao deletar notificações', erro: notifError })
    }

    // depois apaga confirmacoes
    const { error: confirmError } = await supabase
      .from('escala_confirmacao')
      .delete()
      .eq('matricula_funcionario', matricula_funcionario)

    if (confirmError) {
      return res.status(400).json({ mensagem: 'Erro ao deletar conformações', erro: confirmError })
    }

    //depois apaga o funcionario
    const { error: funcError } = await supabase
      .from('funcionario')
      .delete()
      .eq('matricula_funcionario', matricula_funcionario)

    if (funcError) {
      return res.status(400).json({ mensagem: 'Erro ao deletar funcionário', erro: funcError })
    }

    res.status(200).json({ mensagem: 'Funcionário deletado com sucesso' })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// escala

// Cadastrar escala e vincular ao funcionário
// POST /cadastrarEscala
route.post('/cadastrarEscala_master', async (req, res) => {
  const obrigatorios = ['matricula_funcionario', 'data_inicio', 'tipo_escala']
  const campoFaltando = validarCampos(obrigatorios, req.body)
  if (campoFaltando)
    return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })

  try {
    const {
      matricula_funcionario,
      data_inicio,
      tipo_escala,
      dias_n_trabalhados_escala_semanal,
      usa_dias_especificos
    } = req.body

    // Interpretar escala tipo NxM
    const padrao = /^(\d{1,2})x(\d{1,2})$/
    const match = tipo_escala.match(padrao)
    if (!match) return res.status(400).json({ mensagem: 'Tipo de escala inválido' })
    let n = parseInt(match[1], 10),
      m = parseInt(match[2], 10)
    if (n + m > 7) {
      n = Math.ceil(n / 24)
      m = Math.ceil(m / 24)
    }

    // Verifica se precisa de dias específicos
    const precisa_dias_especificos = usa_dias_especificos === 'SIM'

    if (precisa_dias_especificos) {
      const diasArray = Array.isArray(dias_n_trabalhados_escala_semanal)
        ? dias_n_trabalhados_escala_semanal
        : []
      if (diasArray.length === 0)
        return res.status(400).json({ mensagem: 'Informe os dias específicos de folga.' })

      const diasValidos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
      const diasInvalidos = diasArray.filter(d => !diasValidos.includes(d))
      if (diasInvalidos.length > 0)
        return res.status(400).json({ mensagem: `Dias inválidos: ${diasInvalidos.join(', ')}` })

      if (diasArray.length !== m)
        return res.status(400).json({
          mensagem: `Quantidade de dias não trabalhados (${m}) difere de dias informados (${diasArray.length}).`
        })
    }

    // Verificar funcionário
    const { data: funcionarioExistente } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()
    if (!funcionarioExistente)
      return res.status(400).json({ mensagem: 'Funcionário não encontrado' })

    // verificar se funcionario ja possui escala
    if (funcionarioExistente.id_escala) {
      return res.status(400).json({ mensagem: 'Funcionário já possui uma escala vinculada' })
    }

    // Inserir escala
    const { data: escalaCriada, error: errorEscala } = await supabase
      .from('escala')
      .insert([
        {
          data_inicio,
          tipo_escala,
          dias_trabalhados: n,
          dias_n_trabalhados: m,
          dias_n_trabalhados_escala_semanal: precisa_dias_especificos
            ? dias_n_trabalhados_escala_semanal
            : null
        }
      ])
      .select()
      .single()

    if (errorEscala) {
      return res.status(400).json({ mensagem: 'Erro ao inserir escala', erro: errorEscala })
    }

    // Vincular escala ao funcionário
    const { error: errorVinculo } = await supabase
      .from('funcionario')
      .update({ id_escala: escalaCriada.id_escala })
      .eq('matricula_funcionario', matricula_funcionario)

    if (errorVinculo) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao vincular escala ao funcionário', erro: errorVinculo })
    }

    // notificar criação de escala
    await criarNotificacao({
      matricula_funcionario,
      tipo_notificacao: 'Nova Escala',
      mensagem: `Sua nova escala foi cadastrada: Início em ${data_inicio}, Tipo: ${tipo_escala}. Por favor, confirme o recebimento da escala no sistema.`,
    })

    // confirmacao

    const { data: confirmacaoCriada, error: errorConfirmacao } = await supabase
      .from('escala_confirmacao')
      .insert([
        {
          matricula_funcionario: funcionarioExistente.matricula_funcionario,
          id_escala: escalaCriada.id_escala
        }
      ])
      .select('*')
      .single()

    if (errorConfirmacao) {
      console.error('Erro ao criar confirmação da escala:', errorConfirmacao)
      // opcional: desfazer escala criada ou retornar erro
      return res.status(400).json({ mensagem: 'Erro ao criar confirmação da escala', erro: errorConfirmacao })
    }

    // Vincular o id da confirmação (id_confirmacao) ao funcionário
    const { error: errorVinculoConfirm } = await supabase
      .from('funcionario')
      .update({ id_confirmacao: confirmacaoCriada.id_confirmacao })
      .eq('matricula_funcionario', funcionarioExistente.matricula_funcionario)

    if (errorVinculoConfirm) {
      console.error('Erro ao vincular confirmação ao funcionário:', errorVinculoConfirm)
      // não interromper necessariamente, mas informar
    }

    return res.status(201).json({ mensagem: 'Escala cadastrada com sucesso', escala: escalaCriada })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// PUT /alterarEscala
route.put('/alterarEscala_master', async (req, res) => {
  const obrigatorios = ['matricula_funcionario', 'data_inicio', 'tipo_escala']
  const campoFaltando = validarCampos(obrigatorios, req.body)
  if (campoFaltando)
    return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })

  try {
    const {
      matricula_funcionario,
      data_inicio,
      tipo_escala,
      dias_n_trabalhados_escala_semanal,
      usa_dias_especificos
    } = req.body

    const padrao = /^(\d{1,2})x(\d{1,2})$/
    const match = tipo_escala.match(padrao)
    if (!match) return res.status(400).json({ mensagem: 'Tipo de escala inválido' })
    let n = parseInt(match[1], 10),
      m = parseInt(match[2], 10)
    if (n + m > 7) {
      n = Math.ceil(n / 24)
      m = Math.ceil(m / 24)
    }

    const precisa_dias_especificos = usa_dias_especificos === 'SIM'
    let diasArray = []
    if (precisa_dias_especificos) {
      diasArray = Array.isArray(dias_n_trabalhados_escala_semanal)
        ? dias_n_trabalhados_escala_semanal
        : []
      if (diasArray.length === 0)
        return res.status(400).json({ mensagem: 'Informe os dias específicos de folga.' })
      const diasValidos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
      const diasInvalidos = diasArray.filter(d => !diasValidos.includes(d))
      if (diasInvalidos.length > 0)
        return res.status(400).json({ mensagem: `Dias inválidos: ${diasInvalidos.join(', ')}` })
      if (diasArray.length !== m)
        return res.status(400).json({
          mensagem: `Quantidade de dias não trabalhados (${m}) difere de dias informados (${diasArray.length}).`
        })
    }

    // Verificar funcionário e setor
    const { data: funcionarioExistente } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()
    if (!funcionarioExistente)
      return res.status(400).json({ mensagem: 'Funcionário não encontrado' })
    if (!funcionarioExistente.id_escala)
      return res.status(400).json({ mensagem: 'Funcionário não possui escala vinculada' })

    // Alterar escala
    const { data: escalaAtualizada, error } = await supabase
      .from('escala')
      .update({
        data_inicio,
        tipo_escala,
        dias_trabalhados: n,
        dias_n_trabalhados: m,
        dias_n_trabalhados_escala_semanal: precisa_dias_especificos
          ? dias_n_trabalhados_escala_semanal
          : [],
        usa_dias_especificos: precisa_dias_especificos
      })
      .eq('id_escala', funcionarioExistente.id_escala)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao atualizar escala', erro: error })
    }

    // notificar alteração de escala
    await criarNotificacao({
      matricula_funcionario,
      tipo_notificacao: 'Atualização de Escala',
      mensagem: `Sua escala foi atualizada: Início em ${data_inicio}, Tipo: ${tipo_escala}. Por favor, confirme o recebimento da escala no sistema.`,
    })

    // confirmacao

     // remover confirmação antiga (se existir) associada à escala anterior do funcionário
        if (funcionarioExistente.id_escala) {
          const { error: errorDeletar } = await supabase
            .from('escala_confirmacao')
            .delete()
            .eq('id_escala', funcionarioExistente.id_escala)
            .eq('matricula_funcionario', funcionarioExistente.matricula_funcionario)
    
        // criar nova confirmação para a escala atualizada
        const { data: confirmacaoCriada, error: errorConfirmacao } = await supabase
          .from('escala_confirmacao')
          .insert([
            {
              matricula_funcionario: funcionarioExistente.matricula_funcionario,
              id_escala: escalaAtualizada.id_escala
            }
          ])
          .select('*')
          .single()
    
        if (errorConfirmacao) {
          console.error('Erro ao criar confirmação da escala atualizada:', errorConfirmacao)
          return res.status(400).json({ mensagem: 'Erro ao criar confirmação da escala', erro: errorConfirmacao })
        }
    
        // atualizar o funcionário para apontar para a nova confirmação (usar id_confirmacao retornado)
        const { error: errorAtualizarFunc } = await supabase
          .from('funcionario')
          .update({ id_confirmacao: confirmacaoCriada.id_confirmacao })
          .eq('matricula_funcionario', funcionarioExistente.matricula_funcionario)
    
        if (errorAtualizarFunc) {
          console.error('Erro ao atualizar funcionário com nova confirmação:', errorAtualizarFunc)
        }
    
          if (errorDeletar) {
            console.error('Erro ao deletar confirmação antiga:', errorDeletar)
          }
        }

    return res
      .status(200)
      .json({ mensagem: 'Escala alterada com sucesso', escala: escalaAtualizada })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

route.get('/listarEscalas_master', async (req, res) => {
  try {
    const { data, error } = await supabase.from('escala').select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar escalas', erro: error })
    }
    res.status(200).json({ escalas: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// turno
// cadastrar turno e vincular ao funcionário
route.post('/cadastrarTurno_master', async (req, res) => {
  try {
    const obrigatorios = [
      'matricula_funcionario',
      'inicio_turno',
      'termino_turno',
      'duracao_turno',
      'intervalo_turno'
    ]
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) {
      return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    const { matricula_funcionario, inicio_turno, termino_turno, duracao_turno, intervalo_turno } =
      req.body

    // Verificar se funcionário existe
    const { data: funcionarioExistente, error: errorFuncionario } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (errorFuncionario) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao buscar funcionário', erro: errorFuncionario })
    }
    if (!funcionarioExistente) {
      return res.status(400).json({ mensagem: 'Matrícula do funcionário não encontrada' })
    }

    // garantir que o funcionario possua escala antes de buscar turnos
    if (!funcionarioExistente.id_escala) {
      return res.status(400).json({
        mensagem:
          'Funcionário não possui escala vinculada. Cadastre uma escala antes de adicionar um turno.'
      })
    }

    // verificar se o funcionario já possui um turno vinculado
    if (funcionarioExistente.id_turno) {
      return res.status(400).json({ mensagem: 'Funcionário já possui um turno vinculado' })
    }

    // Inserir turno
    const { data: turnoCriado, error: errorTurno } = await supabase
      .from('turno')
      .insert([{ inicio_turno, termino_turno, duracao_turno, intervalo_turno }])
      .select('*')
      .single()

    if (errorTurno) {
      return res.status(400).json({ mensagem: 'Erro ao inserir turno', erro: errorTurno })
    }

    // Vincular turno criado ao funcionário
    const { data: turnoVinculado, error: errorVinculo } = await supabase
      .from('funcionario')
      .update({ id_turno: turnoCriado.id_turno })
      .eq('matricula_funcionario', matricula_funcionario)
      .select('*')
      .single()

    if (errorVinculo) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao vincular turno ao funcionário!', erro: errorVinculo })
    }

    // notificar criação de turno
    await criarNotificacao({
      matricula_funcionario,
      tipo_notificacao: 'Novo Turno',
      mensagem: `Seu novo turno foi cadastrado: ${inicio_turno} - ${termino_turno}.`,
    })

    res.status(201).json({
      mensagem: 'Turno cadastrado e vinculado com sucesso',
      turno: turnoCriado,
      funcionario: turnoVinculado
    })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

route.put('/alterarTurno_master', async (req, res) => {
  try {
    const obrigatorios = [
      'matricula_funcionario',
      'inicio_turno',
      'termino_turno',
      'duracao_turno',
      'intervalo_turno'
    ]
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) {
      return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    const { matricula_funcionario, inicio_turno, termino_turno, duracao_turno, intervalo_turno } =
      req.body

    // Verificar se funcionário existe
    const { data: funcionarioExistente, error: errorFuncionario } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (errorFuncionario) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao buscar funcionário', erro: errorFuncionario })
    }
    if (!funcionarioExistente) {
      return res.status(400).json({ mensagem: 'Matrícula do funcionário não encontrada' })
    }

    // garantir que o funcionario possua turno antes de alterar
    if (!funcionarioExistente.id_turno) {
      return res.status(400).json({
        mensagem:
          'Funcionário não possui turno vinculado. Cadastre um turno antes de tentar alterá-lo.'
      })
    }

    // Alterar turno
    const { data: turnoAtualizado, error: errorTurno } = await supabase
      .from('turno')
      .update({ inicio_turno, termino_turno, duracao_turno, intervalo_turno })
      .eq('id_turno', funcionarioExistente.id_turno)
      .select('*')
      .single()

    if (errorTurno) {
      return res.status(400).json({ mensagem: 'Erro ao alterar turno', erro: errorTurno })
    }

    // notificar alteração de turno
    await criarNotificacao({
      matricula_funcionario,
      tipo_notificacao: 'Atualização de Turno',
      mensagem: `Seu turno foi atualizado: ${inicio_turno} - ${termino_turno}.`,
    })

    res.status(200).json({
      mensagem: 'Turno alterado com sucesso',
      turno: turnoAtualizado
    })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

route.get('/listarTurnos_master', async (req, res) => {
  try {
    const { data, error } = await supabase.from('turno').select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar turnos', erro: error })
    }
    res.status(200).json({ turnos: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

//Setores

// Criar Setor
route.post('/cadastrarSetor', async (req, res) => {
  try {
    const { nome_setor } = req.body

    if (!nome_setor) {
      return res.status(400).json({ mensagem: 'Informe o nome do setor' })
    }

    // Verificar se já existe
    const { data: setorExistente } = await supabase
      .from('setor')
      .select('*')
      .eq('nome_setor', nome_setor)
      .maybeSingle()

    if (setorExistente) {
      return res.status(400).json({ mensagem: 'Setor já cadastrado' })
    }

    const { data, error } = await supabase.from('setor').insert([{ nome_setor }]).select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao cadastrar setor', erro: error })
    }

    res.status(201).json({ mensagem: 'Setor cadastrado com sucesso', setor: data[0] })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Listar Setores
route.get('/listarSetores', async (req, res) => {
  try {
    const { data, error } = await supabase.from('setor').select('id_setor, nome_setor')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar setores', erro: error })
    }

    res.status(200).json({ setores: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Editar Setor
route.put('/editarSetor/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { nome_setor } = req.body

    if (!nome_setor) {
      return res.status(400).json({ mensagem: 'Informe o nome do setor' })
    }

    const { data, error } = await supabase
      .from('setor')
      .update({ nome_setor })
      .eq('id_setor', id)
      .select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao atualizar setor', erro: error })
    }

    res.status(200).json({ mensagem: 'Setor atualizado com sucesso', setor: data[0] })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Deletar Setor
route.delete('/deletarSetor/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { error } = await supabase.from('setor').delete().eq('id_setor', id)

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao deletar setor', erro: error })
    }

    res.status(200).json({ mensagem: 'Setor deletado com sucesso' })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// adicionar feriados
route.post('/adicionarFeriados_master', async (req, res) => {
  try {
    const feriados = req.body // pode ser um objeto ou array

    if (!feriados || feriados.length === 0) {
      return res.status(400).json({ mensagem: 'Envie pelo menos um feriado' })
    }

    const lista = Array.isArray(feriados) ? feriados : [feriados]

    const invalidos = lista.filter(f => !f.dia_feriado || !f.nome_feriado)
    if (invalidos.length > 0) {
      return res
        .status(400)
        .json({ mensagem: 'Todos os feriados devem conter dia_feriado e nome_feriado' })
    }

    const { data, error } = await supabase.from('feriado').insert(lista).select()

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao adicionar feriados', erro: error })
    }

    res.status(201).json({
      mensagem: 'Feriados adicionados com sucesso',
      feriados: data
    })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Listar Feriados

route.get('/listarFeriados_master', async (req, res) => {
  try {
    const { data, error } = await supabase.from('feriado').select('*')

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao listar feriados', erro: error })
    }
    res.status(200).json({ feriados: data })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Deletar Feriado

route.delete('/deletarFeriado_master/:id_feriado', async (req, res) => {
  try {
    const { id_feriado } = req.params

    const { error } = await supabase.from('feriado').delete().eq('id_feriado', id_feriado)

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao deletar feriado', erro: error })
    }

    res.status(200).json({ mensagem: 'Feriado deletado com sucesso' })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

export default route
