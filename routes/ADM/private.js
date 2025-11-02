import express from 'express'
import supabase from '../../supabase.js'
import bcrypt from 'bcrypt'

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

// rota para gerar notificacao de um relatorio de quantos funcionarios aina faltam confirmar a escala no setor do adm ( a cada tempo determinado )
route.post('/notificarFaltamConfirmar/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params
    if (!matricula_adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
    }
    // buscar setor do adm
    const { data: adm, error: errorAdm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()
    if (errorAdm) {
      return res.status(400).json({ mensagem: 'Erro ao buscar ADM', erro: errorAdm })
    }
    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar funcionarios do setor que possuem escala
    const { data: funcionarios, error } = await supabase
      .from('funcionario')
      .select(
        `matricula_funcionario,
            nome,
            escala_confirmacao:escala_confirmacao!escala_confirmacao_matricula_funcionario_fkey(
                id_confirmacao,
                id_escala,
                data_confirmacao,
                status
            ),
            escala(id_escala, data_inicio, tipo_escala)
        ` )
      .eq('id_setor', adm.id_setor)
      .not('id_escala', 'is', null)
    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar funcionários', erro: error })
    }

    // filtrar funcionarios que nao possuem confirmacao de escala
    const faltamConfirmar = (funcionarios || []).filter(
      f => !f.escala_confirmacao || (Array.isArray(f.escala_confirmacao) && f.escala_confirmacao.length === 0)
    )

    const quantidadeFaltam = faltamConfirmar.length

    // preparar lista de nomes/matrículas para retorno
    const listaNaoConfirmaram = faltamConfirmar.map(f => ({
      matricula: f.matricula_funcionario,
      nome: f.nome || 'Nome não informado'
    }))

    // criar notificacao para o adm (texto breve)
    const mensagemNotificacao = `Existem ${quantidadeFaltam} funcionário(s) que ainda não confirmaram sua escala.`

    await criarNotificacao({
      matricula_funcionario: matricula_adm ,
      tipo_notificacao: 'FALTAM_CONFIRMAR_ESCALA',
      mensagem: mensagemNotificacao
    })

    // retornar quantidade e lista com nomes/matrículas
    res.status(200).json({
      mensagem: 'Notificação criada com sucesso',
      quantidade_faltam: quantidadeFaltam,
      faltam_confirmar: listaNaoConfirmaram
    })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

//contabilizar funcionarios por equipe
route.get('/funcionariosEquipe/:id_equipe', async (req, res) => {
  try {
    const id_equipe = req.params

    if (!id_equipe) {
      return res.status(400).json({ mensagem: 'ID do setor é obrigatório' })
    }

    //buscar funcionarios que possuem o id da equipe
    const { data: funcionariosEquipe, error } = await supabase
      .from('funcionario')
      .select('equipe(nome_equipe)')
      .eq('id_equipe', id_equipe.id_equipe)
      .not('id_equipe', 'is', null)

    if (error) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao buscar funcionários da equipe', erro: error })
    }

    const quantidadeFuncionarios = funcionariosEquipe.length
    res.status(200).json({ quantidade: quantidadeFuncionarios })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// contabilizar funcionarios por escala
route.get('/funcionariosEscala/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params

    if (!matricula_adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
    }

    // buscar setor do adm
    const { data: adm, error: errorAdm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (errorAdm) {
      return res.status(400).json({ mensagem: 'Erro ao buscar ADM', erro: errorAdm })
    }

    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar funcionarios do setor que possuam id_escala e trazer apenas o tipo_escala
    const { data: funcionariosComEscala, error } = await supabase
      .from('funcionario')
      .select('escala(tipo_escala)')
      .eq('id_setor', adm.id_setor)
      .not('id_escala', 'is', null)

    if (error) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao buscar funcionários com escala', erro: error })
    }

    // Agregar contagem por tipo_escala
    const mapa = new Map()
    for (const f of funcionariosComEscala) {
      const tipo = f.escala && f.escala.tipo_escala ? f.escala.tipo_escala : 'Não informado'
      if (!mapa.has(tipo)) {
        mapa.set(tipo, {
          tipo_escala: tipo,
          quantidade: 0
        })
      }
      mapa.get(tipo).quantidade += 1
    }

    const contagem = Array.from(mapa.values())

    res.status(200).json(contagem)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// listar equipes do setor (apenas equipes com funcionários no setor)
route.get('/equipesSetor/:matricula_adm', async (req, res) => {
  const { matricula_adm } = req.params
  if (!matricula_adm) {
    return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
  }
  try {
    // buscar setor do adm
    const { data: adm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar equipes diretamente na tabela equipe (retorna todas as equipes do setor)
    const { data: equipes, error } = await supabase
      .from('equipe')
      .select('id_equipe, nome_equipe')
      .eq('id_setor', adm.id_setor)
      .order('nome_equipe', { ascending: true })

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar equipes', erro: error })
    }

    res.status(200).json(equipes || [])
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// listar regiões do setor
route.get('/regiaoSetor/:matricula_adm', async (req, res) => {
  const { matricula_adm } = req.params

  if (!matricula_adm) {
    return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
  }

  try {
    //buscar setor do adm
    const { data: setorData } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (!setorData) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar regiões que possuem funcionários no setor
    const { data: regioes, error } = await supabase
      .from('funcionario')
      .select('id_regiao, regiao:regiao(nome_regiao)')
      .eq('id_setor', setorData.id_setor)
      .not('id_regiao', 'is', null)

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar regiões', erro: error })
    }

    // Remover duplicatas e formatar resultado
    const regioesUnicas = []
    const nomesVistos = new Set()
    for (const f of regioes) {
      if (f.regiao && f.regiao.nome_regiao && !nomesVistos.has(f.regiao.nome_regiao)) {
        regioesUnicas.push({
          id_regiao: f.id_regiao,
          nome_regiao: f.regiao.nome_regiao
        })

        nomesVistos.add(f.regiao.nome_regiao)
      }
    }
    res.status(200).json(regioesUnicas)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

//listar escalas do setor
route.get('/escalasSetor/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params

    if (!matricula_adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
    }

    // buscar setor do adm
    const { data: adm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar escalas do setor
    const { data: escalas, error } = await supabase
      .from('funcionario')
      .select(
        `matricula_funcionario, nome,
            escala(id_escala, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala, dias_n_trabalhados_escala_semanal)`
      )
      .eq('id_setor', adm.id_setor)
      .not('id_escala', 'is', null) // filtrar apenas funcionarios com escala vinculada
      .order('nome', { ascending: true }) // ordenar por nome do funcionário

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar escalas', erro: error })
    }

    res.status(200).json(escalas)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// listar turnos do setor (retorna todas as informações do turno)
route.get('/turnosSetor/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params
    if (!matricula_adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
    }

    // buscar setor do adm
    const { data: adm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar todos id_turno dos funcionários do setor
    const { data: funcionarios, error: errorFuncionarios } = await supabase
      .from('funcionario')
      .select('id_turno')
      .eq('id_setor', adm.id_setor)
      .not('id_turno', 'is', null)

    if (errorFuncionarios) {
      return res
        .status(400)
        .json({ mensagem: 'Erro ao buscar funcionários do setor', erro: errorFuncionarios })
    }

    // Extrair ids únicos de turno
    const turnosIds = [...new Set(funcionarios.map(f => f.id_turno))]

    if (turnosIds.length === 0) {
      return res.status(200).json([]) // Nenhum turno vinculado
    }

    // Buscar todos os turnos completos pelo id_turno
    const { data: turnos, error: errorTurnos } = await supabase
      .from('turno')
      .select('*')
      .in('id_turno', turnosIds)
      .order('id_turno', { ascending: true })

    if (errorTurnos) {
      return res.status(400).json({ mensagem: 'Erro ao buscar turnos', erro: errorTurnos })
    }

    res.status(200).json(turnos)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

//listar funcionarios do setor do adm
route.get(`/funcionariosSetor/:matricula_adm`, async (req, res) => {
  try {
    const { matricula_adm } = req.params

    if (!matricula_adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })
    }

    // buscar setor do adm
    const { data: adm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // buscar funcionarios do setor
    const { data: funcionarios, error } = await supabase
      .from('funcionario')
      .select('*')
      .eq('id_setor', adm.id_setor)
      .neq('matricula_funcionario', matricula_adm) // Excluir o próprio ADM da lista
      .order('nome', { ascending: true })

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar funcionários', erro: error })
    }

    res.status(200).json(funcionarios)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// retornar confimação de leitura da escala de todos os funcionarios do setor
route.get('/confirmacoesSetor/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params
    if (!matricula_adm) return res.status(400).json({ mensagem: 'Matrícula do ADM é obrigatória' })

    // Buscar setor do ADM
    const { data: adm, error: errorAdm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (errorAdm) return res.status(400).json({ mensagem: 'Erro ao buscar ADM', erro: errorAdm })
    if (!adm) return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })

    // Buscar confirmações de leitura da escala dos funcionários do setor
    const { data: confirmacoes, error } = await supabase
      .from('funcionario')
      .select(
        `
                matricula_funcionario,
                nome,
                escala_confirmacao:escala_confirmacao!escala_confirmacao_matricula_funcionario_fkey(
                    id_confirmacao,
                    id_escala,
                    data_confirmacao,
                    status
                ),
                escala(id_escala, data_inicio, tipo_escala)
            `
      )
      .eq('id_setor', adm.id_setor)
      .not('id_escala', 'is', null)
      .order('nome', { ascending: true })

    if (error) return res.status(400).json({ mensagem: 'Erro ao buscar confirmações', erro: error })

    res.status(200).json(confirmacoes)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Mostrar funcionários que estão atuando em determinada data (filtrado por setor do ADM)
route.get('/funcionariosAtivosSetor/:matricula_adm', async (req, res) => {
  const matricula_adm = req.params.matricula_adm
  try {
    let { data: dataConsulta } = req.query
    if (!dataConsulta) {
      return res
        .status(400)
        .json({ mensagem: 'Data é obrigatória no formato DD/MM/YYYY ou YYYY-MM-DD' })
    }

    // aceitar formato DD/MM/YYYY convertendo para ISO YYYY-MM-DD
    if (typeof dataConsulta === 'string' && dataConsulta.includes('/')) {
      const partes = dataConsulta.split('/')
      if (partes.length !== 3) {
        return res
          .status(400)
          .json({ mensagem: 'Formato de data inválido. Use DD/MM/YYYY ou YYYY-MM-DD.' })
      }
      dataConsulta = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`
    }

    const consultaDate = new Date(dataConsulta)
    if (isNaN(consultaDate.getTime())) {
      return res.status(400).json({ mensagem: 'Data inválida' })
    }

    // buscar setor do adm
    const { data: adm, error: errorAdm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (errorAdm) {
      return res.status(400).json({ mensagem: 'Erro ao buscar ADM', erro: errorAdm })
    }
    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    // Buscar funcionários do mesmo setor com escala vinculada
    const { data: funcionarios, error } = await supabase
      .from('funcionario')
      .select(
        `
                matricula_funcionario, nome, id_escala,
                escala(id_escala, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala, dias_n_trabalhados_escala_semanal)
            `
      )
      .eq('id_setor', adm.id_setor)
      .not('id_escala', 'is', null)

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao buscar funcionários', erro: error })
    }

    // Função local para verificar se o funcionário está ativo na data (recebe Date)
    function estaAtivoNaData(func, consulta) {
      const escala = func.escala
      if (!escala || !escala.data_inicio) return false

      const inicio = new Date(escala.data_inicio)
      if (isNaN(inicio.getTime())) return false
      if (consulta < inicio) return false

      const diffDias = Math.floor((consulta - inicio) / (1000 * 60 * 60 * 24))
      const ciclo = Number(escala.dias_trabalhados) + Number(escala.dias_n_trabalhados)
      if (ciclo === 0) return false

      // Verificação de folgas semanais (dias específicos)
      if (escala.dias_n_trabalhados_escala_semanal) {
        let diasFolga = escala.dias_n_trabalhados_escala_semanal

        // Caso venha em formato de string JSON, converter
        if (typeof diasFolga === 'string') {
          try {
            diasFolga = JSON.parse(diasFolga)
          } catch {
            diasFolga = []
          }
        }

        if (Array.isArray(diasFolga) && diasFolga.length > 0) {
          const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
          const diaSemana = diasSemana[consulta.getDay()]

          // Normalizar maiúsculas/minúsculas
          const diaNormalizado = diaSemana.toLowerCase().trim()
          const folgasNormalizadas = diasFolga.map(d => String(d).toLowerCase().trim())

          if (folgasNormalizadas.includes(diaNormalizado)) {
            return false // está de folga neste dia
          }
        }
      }

      const posicaoNoCiclo = diffDias % ciclo
      return posicaoNoCiclo < Number(escala.dias_trabalhados)
    }

    // Filtrar os funcionários ativos na data (apenas do setor do ADM)
    const ativos = funcionarios.filter(func => estaAtivoNaData(func, consultaDate))

    res.status(200).json(ativos)
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Cadastrar funcionário no setor do adm
route.post('/cadastrarFuncionario', async (req, res) => {
  try {
    const obrigatorios = [
      'matricula_adm',
      'matricula_funcionario',
      'nome',
      'email',
      'telefone',
      'nome_regiao',
      'nome_equipe'
    ]
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) {
      return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    //verificar se matricula possui 5 digitos
    if (String(req.body.matricula_funcionario).length !== 5) {
      return res.status(400).json({ mensagem: 'A matrícula deve conter exatamente 5 dígitos' })
    }

    const {
      matricula_adm,
      matricula_funcionario,
      nome,
      email,
      telefone,
      cargo,
      nome_regiao,
      nome_equipe
    } = req.body

    let senha = String(matricula_funcionario)
    // Criptografar senha
    const salt = await bcrypt.genSalt(10)
    const senhaHash = await bcrypt.hash(senha, salt)

    let equipeId
    //encontrar equipe pelo nome
    const { data: equipeExistente } = await supabase
      .from('equipe')
      .select('id_equipe')
      .eq('nome_equipe', nome_equipe)
      .maybeSingle()

    if (!equipeExistente) {
      return res.status(400).json({
        mensagem: 'Equipe não encontrada. Cadastre a equipe antes de vincular ao funcionário.'
      })
    } else {
      equipeId = equipeExistente.id_equipe
    }

    let regiaoId
    // encontrar regiao pelo nome
    const { data: regiaoExistente } = await supabase
      .from('regiao')
      .select('id_regiao')
      .eq('nome_regiao', nome_regiao)
      .maybeSingle()

    if (regiaoExistente) {
      // se regiao existe usa o id
      regiaoId = regiaoExistente.id_regiao
    } else {
      // se regiao nao existe cria outra
      const { data: novaRegiao, error: errorNovaRegiao } = await supabase
        .from('regiao')
        .insert([{ nome_regiao: nome_regiao }])
        .select('id_regiao')
        .single()

      if (errorNovaRegiao) {
        return res
          .status(400)
          .json({ mensagem: 'Erro ao criar nova regiao', erro: errorNovaRegiao })
      }

      regiaoId = novaRegiao.id_regiao

      // notificar criação de região
      await criarNotificacao({
        tipo_notificacao: 'CADASTRO_REGIAO',
        mensagem: `Região criada: ${nome_regiao}`,
        matricula_responsavel: matricula_adm
      })
    }

    // Verificar se matrícula já existe
    const { data: funcionarioExistente } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (funcionarioExistente) {
      return res.status(400).json({ mensagem: 'Matrícula já cadastrada' })
    }

    // verificar setor do adm para vincular ao funcionario
    const { data: adm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

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
          id_regiao: regiaoId,
          id_equipe: equipeId,
          id_setor: adm.id_setor,
          cargo: cargo
        }
      ])
      .select()

    if (error) {
      return res.status(400).json({ mensagem: 'Erro ao inserir dados', erro: error })
    }

    // gerar primeira notificação (Boas Vindas)
    const { data: notificacao, error: errorNotificacao } = await supabase
      .from('notificacoes')
      .insert([
        {
          matricula_funcionario: matricula_funcionario,
          tipo_notificacao: 'BOAS_VINDAS',
          mensagem: ``,
          lida: false,
          enviada_em: new Date().toISOString()
        }
      ])
      .select()
      .single()

    if (errorNotificacao) {
      console.error('Erro ao criar notificação de boas-vindas:', errorNotificacao)
    }

    // notificar cadastro de funcionário (registro geral)
    await criarNotificacao({
      matricula_funcionario,
      tipo_notificacao: 'CADASTRO_FUNCIONARIO',
      mensagem: `Bem vindo ao sistema de gerenciamento de escalas! Sua matrícula é ${matricula_funcionario}, a mesma é também sua senha inicial. Por favor, altere sua senha após o primeiro acesso.`,
      matricula_responsavel: matricula_adm
    })

    res.status(201).json({ mensagem: 'Funcionário cadastrado com sucesso', funcionario: data[0] })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// editar informacoes do funcionario do setor do adm
route.put('/editarFuncionario/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params
    const { matricula_funcionario, email, telefone, cargo } = req.body
    let equipe = req.body.equipe
    let regiao = req.body.regiao

    const obrigatorios = ['matricula_funcionario']
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) return res.status(400).json({ mensagem: `Campo obrigatório ausente: ${campoFaltando}` })

    // buscar setor do ADM
    const { data: adm, error: errAdm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()
    if (errAdm) return res.status(400).json({ mensagem: 'Erro ao buscar ADM', erro: errAdm })
    if (!adm) return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })

    // buscar funcionário
    const { data: funcionarioDesatualizado, error: errFunc } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()
    if (errFunc) return res.status(400).json({ mensagem: 'Erro ao buscar funcionário', erro: errFunc })
    if (!funcionarioDesatualizado) return res.status(404).json({ mensagem: 'Funcionário não encontrado' })

    // verificar setor do adm
    if (funcionarioDesatualizado.id_setor !== adm.id_setor) {
      return res.status(403).json({ mensagem: 'Funcionário não pertence ao setor do ADM' })
    }

    const isNumeric = (v) => typeof v === 'number' || (/^\d+$/.test(String(v).trim()))

    // --- tratar equipe: aceitar id ou nome; buscar lista limitada e pegar primeiro elemento ---
    if (equipe !== undefined && equipe !== null && String(equipe).trim() !== '') {
      if (isNumeric(equipe)) {
        const id = Number(equipe)
        const { data: eqById, error: errEqById } = await supabase
          .from('equipe')
          .select('id_equipe')
          .eq('id_equipe', id)
          .maybeSingle()
        if (errEqById) return res.status(502).json({ mensagem: 'Erro ao buscar equipe por id', erro: errEqById })
        if (!eqById) {
          return res.status(400).json({ mensagem: 'Equipe não encontrada por id. Cadastre a equipe antes de vincular ao funcionário.' })
        }
        equipe = eqById.id_equipe
      } else {
        // busca por nome -> retorna array limitado a 1 para evitar PGRST116
        const nome = String(equipe).trim()
        const { data: lista, error: errLista } = await supabase
          .from('equipe')
          .select('id_equipe, nome_equipe')
          .ilike('nome_equipe', nome)
          .limit(1)

        if (errLista) return res.status(502).json({ mensagem: 'Erro ao buscar equipe por nome', erro: errLista })
        if (!lista || lista.length === 0) {
          return res.status(400).json({ mensagem: 'Equipe não encontrada. Cadastre a equipe antes de vincular ao funcionário.' })
        }
        equipe = lista[0].id_equipe
      }
    }

    // --- tratar regiao: aceitar id ou nome; buscar lista limitada e pegar primeiro elemento / criar se necessário ---
    if (regiao !== undefined && regiao !== null && String(regiao).trim() !== '') {
      if (isNumeric(regiao)) {
        regiao = Number(regiao)
      } else {
        const nomeR = String(regiao).trim()
        const { data: listaRg, error: errRg } = await supabase
          .from('regiao')
          .select('id_regiao, nome_regiao')
          .ilike('nome_regiao', nomeR)
          .limit(1)

        if (errRg) return res.status(502).json({ mensagem: 'Erro ao buscar regiao por nome', erro: errRg })

        if (listaRg && listaRg.length > 0) {
          regiao = listaRg[0].id_regiao
        } else {
          const { data: novaReg, error: errCriar } = await supabase
            .from('regiao')
            .insert([{ nome_regiao: nomeR }])
            .select('id_regiao')
            .single()
          if (errCriar) return res.status(400).json({ mensagem: 'Erro ao criar regiao', erro: errCriar })
          regiao = novaReg.id_regiao
        }
      }
    }

    const payloadToUpdate = {
      email: email !== undefined ? email : funcionarioDesatualizado.email,
      telefone: telefone !== undefined ? telefone : funcionarioDesatualizado.telefone,
      cargo: cargo !== undefined ? cargo : funcionarioDesatualizado.cargo,
      id_equipe: equipe !== undefined ? equipe : funcionarioDesatualizado.id_equipe,
      id_regiao: regiao !== undefined ? regiao : funcionarioDesatualizado.id_regiao
    }

    const { data: funcionarioAtualizado, error: errUpdate } = await supabase
      .from('funcionario')
      .update(payloadToUpdate)
      .eq('matricula_funcionario', matricula_funcionario)
      .select('matricula_funcionario, nome, email, telefone, cargo, id_equipe, id_regiao')
      .maybeSingle()

    if (errUpdate) {
      console.error('Erro ao atualizar funcionário:', errUpdate)
      return res.status(400).json({ mensagem: 'Erro ao atualizar funcionário', erro: errUpdate })
    }

    await criarNotificacao({
      matricula_funcionario,
      tipo_notificacao: 'EDIÇÃO_FUNCIONARIO',
      mensagem: `Funcionário atualizado: ${funcionarioAtualizado?.nome ?? matricula_funcionario}`,
      matricula_responsavel: matricula_adm
    })

    return res.status(200).json({
      mensagem: 'Funcionário atualizado com sucesso',
      funcionario: funcionarioAtualizado
    })
  } catch (error) {
    console.error('Erro inesperado:', error)
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// Cadastrar escala e vincular ao funcionário
// POST /cadastrarEscala
route.post('/cadastrarEscala', async (req, res) => {
  const obrigatorios = ['matricula_adm', 'matricula_funcionario', 'data_inicio', 'tipo_escala']
  const campoFaltando = validarCampos(obrigatorios, req.body)
  if (campoFaltando)
    return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })

  try {
    const {
      matricula_adm,
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
      tipo_notificacao: 'CADASTRO_ESCALA',
      mensagem: `Escala cadastrada para ${matricula_funcionario}: ${tipo_escala} (início ${data_inicio})`,
      matricula_responsavel: matricula_adm
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
route.put('/alterarEscala', async (req, res) => {
  const obrigatorios = ['matricula_adm', 'matricula_funcionario', 'data_inicio', 'tipo_escala']
  const campoFaltando = validarCampos(obrigatorios, req.body)
  if (campoFaltando)
    return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })

  try {
    const {
      matricula_adm,
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
      tipo_notificacao: 'ALTERACAO_ESCALA',
      mensagem: `Escala alterada para ${matricula_funcionario}: ${tipo_escala} (início ${data_inicio})`,
      matricula_responsavel: matricula_adm
    })

    // confirmacao

    // remover confirmação antiga (se existir) associada à escala anterior do funcionário
    if (funcionarioExistente.id_escala) {
      const { error: errorDeletar } = await supabase
        .from('escala_confirmacao')
        .delete()
        .eq('id_escala', funcionarioExistente.id_escala)
        .eq('matricula_funcionario', funcionarioExistente.matricula_funcionario)

      if (errorDeletar) {
        console.error('Erro ao deletar confirmação antiga:', errorDeletar)
      }
    }

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

    return res
      .status(200)
      .json({ mensagem: 'Escala alterada com sucesso', escala: escalaAtualizada })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// cadastrar turno e vincular ao funcionário
route.post('/cadastrarTurno', async (req, res) => {
  try {
    const obrigatorios = [
      'matricula_adm',
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

    const {
      matricula_adm,
      matricula_funcionario,
      inicio_turno,
      termino_turno,
      duracao_turno,
      intervalo_turno
    } = req.body

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
      tipo_notificacao: 'CADASTRO_TURNO',
      mensagem: `Turno cadastrado para ${matricula_funcionario}: ${inicio_turno} - ${termino_turno}`,
      matricula_responsavel: matricula_adm
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

route.put('/alterarTurno', async (req, res) => {
  try {
    const obrigatorios = [
      'matricula_adm',
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

    const {
      matricula_adm,
      matricula_funcionario,
      inicio_turno,
      termino_turno,
      duracao_turno,
      intervalo_turno
    } = req.body

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
      tipo_notificacao: 'ALTERACAO_TURNO',
      mensagem: `Turno alterado para ${matricula_funcionario}: ${inicio_turno} - ${termino_turno}`,
      matricula_responsavel: matricula_adm
    })

    res.status(200).json({
      mensagem: 'Turno alterado com sucesso',
      turno: turnoAtualizado
    })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

// cadastrar equipe
route.post('/cadastrarEquipe/:matricula_adm', async (req, res) => {
  try {
    const { matricula_adm } = req.params
    const obrigatorios = ['nome_equipe']

    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) {
      return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    const { nome_equipe } = req.body

    // Verificar se equipe já existe no setor do adm
    const { data: adm } = await supabase
      .from('funcionario')
      .select('id_setor')
      .eq('matricula_funcionario', matricula_adm)
      .maybeSingle()

    if (!adm) {
      return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
    }

    const { data: equipeExistente, error: errorEquipeExistente } = await supabase
      .from('equipe')
      .select('*')
      .eq('nome_equipe', nome_equipe)
      .eq('id_setor', adm.id_setor)
      .maybeSingle()

    if (errorEquipeExistente) {
      return res.status(400).json({ mensagem: 'Erro ao buscar equipe', erro: errorEquipeExistente })
    }
    if (equipeExistente) {
      return res.status(400).json({ mensagem: 'Equipe já existe neste setor' })
    }

    // Inserir equipe
    const { data: novaEquipe, error: errorNovaEquipe } = await supabase
      .from('equipe')
      .insert([{ nome_equipe, id_setor: adm.id_setor }])
      .select('*')
      .single()

    if (errorNovaEquipe) {
      return res.status(400).json({ mensagem: 'Erro ao inserir equipe', erro: errorNovaEquipe })
    }

    res.status(201).json({ mensagem: 'Equipe cadastrada com sucesso', equipe: novaEquipe })
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})

export default route
