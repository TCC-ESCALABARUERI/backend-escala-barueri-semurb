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

// mostrar todas as escalas cadastradas
route.get('/escalas', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('escala')
            .select('*')


        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao buscar escalas', erro: error })
        }
        res.status(200).json(data)
    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }

})

route.get('/equipes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('equipe')
            .select('id_equipe, nome_equipe')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao buscar equipes', erro: error })
        }
        res.status(200).json(data)
    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

route.get('/regiao', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('regiao')
            .select('id_regiao, nome_regiao')

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao buscar equipes', erro: error })
        }
        res.status(200).json(data)
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
route.get('/confirmacoesLeituraEscala/:matricula_adm', async (req, res) => {
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

        // buscar funcionarios do setor com escala
        const { data: confirmacoes, error } = await supabase
            .from('funcionario')
            .select(`matricula_funcionario, nome,
            escala_confirmacao(id_escala, status, data_confirmacao, 
            escala(id_escala, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala))`)
            .eq('id_setor', adm.id_setor)
            .not('id_escala', 'is', null) // filtrar apenas funcionarios com escala vinculada
            .order('nome', { ascending: true })

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao buscar confirmações de leitura', erro: error })
        }

        res.status(200).json(confirmacoes)

    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// Cadastrar funcionário no setor do adm
route.post('/cadastrarFuncionario', async (req, res) => {
    try {
        const obrigatorios = ['matricula_adm', 'matricula_funcionario', 'nome', 'email', 'telefone', 'nome_regiao', 'nome_equipe']
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) {
            return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
        }

        const { matricula_adm, matricula_funcionario, nome, email, telefone, cargo, nome_regiao, nome_equipe } = req.body
        
        let senha = String(matricula_funcionario)
        // Criptografar senha
        const salt = await bcrypt.genSalt(10)
        const senhaHash = await bcrypt.hash(senha, salt)

        let equipeId;
        //encontrar equipe pelo nome
        const { data: equipeExistente } = await supabase
            .from('equipe')
            .select('id_equipe')
            .eq('nome_equipe', nome_equipe)
            .maybeSingle()

        if (equipeExistente) {
            //se equipe existe usa o id dela
            equipeId = equipeExistente.id_equipe
        } else {
            // se equipe n existe cria outra
            const { data: novaEquipe, error: errorNovaEquipe } = await supabase
                .from('equipe')
                .insert([{ nome_equipe: nome_equipe }])
                .select('id_equipe')
                .single();

            if (errorNovaEquipe) {
                return res.status(400).json({ mensagem: 'Erro ao criar nova equipe', erro: errorNovaEquipe })
            }

            equipeId = novaEquipe.id_equipe
        }

        let regiaoId;
        // encontrar regiao pelo nome
        const { data: regiaoExistente } = await supabase
            .from('regiao')
            .select('id_regiao')
            .eq('nome_regiao', nome_regiao)
            .maybeSingle();

        if (regiaoExistente) {
            // see regiao existe usa o id
            regiaoId = regiaoExistente.id_regiao
        } else {
            //se regiao nao existe cria outra
            const { data: novaRegiao, error: errorNovaRegiao } = await supabase
                .from('regiao')
                .insert([{ nome_regiao: nome_regiao }])
                .select('id_regiao')
                .single()

            if (errorNovaRegiao) {
                return res.status(400).json({ mensagem: 'Erro ao criar nova regiao', erro: errorNovaRegiao })
            }

            regiaoId = novaRegiao.id_regiao
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
            .insert([{
                matricula_funcionario: matricula_funcionario,
                nome: nome,
                email: email,
                senha: senhaHash,
                telefone: telefone,
                id_regiao: regiaoId,
                id_equipe: equipeId,
                id_setor: adm.id_setor,
                cargo: cargo,
            }])
            .select()

        if (error) {
            return res.status(400).json({ mensagem: 'Erro ao inserir dados', erro: error })
        }

        // gerar primeira notificação
        const { data: notificacao, error: errorNotificacao } = await supabase
            .from('notificacoes')
            .insert([{
                matricula_funcionario: matricula_funcionario,
                tipo_notificacao: 'Boas Vindas',
                mensagem: `Olá ${nome}! Bem vindo ao sistema de gerenciamento de escalas.
                Sua matrícula é ${matricula_funcionario}. Por favor, altere sua senha após o primeiro acesso.`,
                lida: false,
                enviada_em: new Date().toISOString()
            }])
            .select()
            .single()

        if (errorNotificacao) {
            return res.status(400).json({ mensagem: 'Erro ao criar notificação', erro: errorNotificacao })
        }

        res.status(201).json({ mensagem: 'Funcionário cadastrado com sucesso', funcionario: data[0] })

    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// editar informacoes do funcionario


// Cadastrar escala e vincular ao funcionário
route.post('/cadastrarEscala', async (req, res) => {
    try {
        const obrigatorios = [
            'matricula_adm',
            'matricula_funcionario',
            'data_inicio',
            'dias_trabalhados',
            'dias_n_trabalhados',
            'tipo_escala'
        ]
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) {
            return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
        }

        const { matricula_adm, matricula_funcionario, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala } = req.body

        // Verificar se funcionário existe
        const { data: funcionarioExistente, error: errorFuncionario } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .maybeSingle()

        if (errorFuncionario) {
            return res.status(400).json({ mensagem: 'Erro ao buscar funcionário', erro: errorFuncionario })
        }
        if (!funcionarioExistente) {
            return res.status(400).json({ mensagem: 'Matrícula do funcionário não encontrada' })
        }

        // verificar setor do adm para garantir que o funcionario pertence ao setor
        const { data: adm } = await supabase
            .from('funcionario')
            .select('id_setor')
            .eq('matricula_funcionario', matricula_adm)
            .maybeSingle()

        if (!adm) {
            return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
        }

        if (funcionarioExistente.id_setor !== adm.id_setor) {
            return res.status(400).json({ mensagem: 'Funcionário não pertence ao setor do ADM' })
        }

        // verificar se o funcionario ja possui uma escala vinculada
        const { data: escalaExistente } = await supabase
            .from('funcionario')
            .select('*')
            .eq('id_escala', funcionarioExistente.id_escala)
            .maybeSingle()

        if (escalaExistente) {
            return res.status(400).json({ mensagem: 'Funcionário já possui uma escala vinculada' })
        }

        // Inserir escala
        const { data: escalaCriada, error: errorEscala } = await supabase
            .from('escala')
            .insert([{ data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala }])
            .select()
            .single()

        if (errorEscala) {
            return res.status(400).json({ mensagem: 'Erro ao inserir escala', erro: errorEscala })
        }

        // Vincular escala ao funcionário
        const { data: funcionarioAtualizado, error: errorUpdate } = await supabase
            .from('funcionario')
            .update({ id_escala: escalaCriada.id_escala })
            .eq('matricula_funcionario', matricula_funcionario)
            .select()

        if (errorUpdate) {
            return res.status(400).json({ mensagem: 'Erro ao vincular escala ao funcionário', erro: errorUpdate })
        }

        // gerar confirmação de leitura da escala
        const { data: primeiraConfirmacao } = await supabase
            .from('escala_confirmacao')
            .insert([{ 
                matricula_funcionario: funcionarioExistente.matricula_funcionario, 
                id_escala: escalaCriada.id_escala }])
            .select('*')
            .single()

            if (!primeiraConfirmacao) {
                return res.status(400).json({ mensagem: 'Erro ao criar confirmação de leitura da escala' })
            }

        // vincular id confirmacao da escala em questão ao funcionario
        const { data: confirmacaoVinculada } = await supabase
            .from('funcionario')
            .update({ id_confirmacao: primeiraConfirmacao.id_confirmacao })
            .eq('matricula_funcionario', funcionarioExistente.matricula_funcionario)
            .select()

        if (!confirmacaoVinculada) {
            return res.status(400).json({ mensagem: 'Erro ao vincular confirmação de leitura ao funcionário' })
        }

        res.status(201).json({
            mensagem: 'Escala cadastrada e vinculada com sucesso',
            escala: escalaCriada,
            funcionario: funcionarioAtualizado
        })

    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }
})

// rota para alterar uma escala existente
route.put('/alterarEscala', async (req, res) => {
    try {
        const obrigatorios = [
            'matricula_adm',
            'matricula_funcionario',
            'data_inicio',
            'dias_trabalhados',
            'dias_n_trabalhados',
            'tipo_escala'
        ]
        const campoFaltando = validarCampos(obrigatorios, req.body)
        if (campoFaltando) {
            return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
        }

        const { matricula_adm, matricula_funcionario, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala } = req.body

        // Verificar se funcionário existe
        const { data: funcionarioExistente, error: errorFuncionario } = await supabase
            .from('funcionario')
            .select('*')
            .eq('matricula_funcionario', matricula_funcionario)
            .maybeSingle()

        if (errorFuncionario) {
            return res.status(400).json({ mensagem: 'Erro ao buscar funcionário', erro: errorFuncionario })
        }
        if (!funcionarioExistente) {
            return res.status(400).json({ mensagem: 'Matrícula do funcionário não encontrada' })
        }

        // garantir que o funcionario possua escala antes de alterar
        if (!funcionarioExistente.id_escala) {
            return res.status(400).json({
                mensagem: 'Funcionário não possui escala vinculada. Cadastre uma escala antes de tentar alterar.'
            })
        }

        // verificar setor do adm para garantir que o funcionario pertence ao setor
        const { data: adm } = await supabase
            .from('funcionario')
            .select('id_setor')
            .eq('matricula_funcionario', matricula_adm)
            .maybeSingle()

        if (!adm) {
            return res.status(400).json({ mensagem: 'Matrícula do ADM não encontrada' })
        }

        if (funcionarioExistente.id_setor !== adm.id_setor) {
            return res.status(400).json({ mensagem: 'Funcionário não pertence ao setor do ADM' })
        }

        // Alterar escala
        const { data: escalaAtualizada, error: errorEscala } = await supabase
            .from('escala')
            .update({ data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala })
            .eq('id_escala', funcionarioExistente.id_escala)
            .select()
            .single()

        if (errorEscala) {
            return res.status(400).json({ mensagem: 'Erro ao alterar escala', erro: errorEscala })
        }

        // gerar nova confirmação de leitura da escala
        const {data: escalaConfirmacao} = await supabase
            .from('escala_confirmacao')
            .insert({ 
                matricula_funcionario: funcionarioExistente.matricula_funcionario, 
                id_escala: escalaAtualizada.id_escala, 
                data_confirmacao: null })
            .select('*')
            .single()

        // garantir que o id_confirmacao do funcionario esteja atualizado
        const { data: novaConfirmacao } = await supabase
            .from('funcionario')
            .update({ id_confirmacao: escalaConfirmacao.id_confirmacao })
            .eq('matricula_funcionario', funcionarioExistente.matricula_funcionario)
            .select()

        if (!novaConfirmacao) {
            return res.status(400).json({ mensagem: 'Erro ao atualizar confirmação de leitura da escala no funcionário' })
        }

        res.status(200).json({
            mensagem: 'Escala alterada com sucesso',
            escala: escalaAtualizada
        })

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

    const { matricula_adm, matricula_funcionario, inicio_turno, termino_turno, duracao_turno, intervalo_turno } = req.body

    // Verificar se funcionário existe
    const { data: funcionarioExistente, error: errorFuncionario } = await supabase
      .from('funcionario')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .maybeSingle()

    if (errorFuncionario) {
      return res.status(400).json({ mensagem: 'Erro ao buscar funcionário', erro: errorFuncionario })
    }
    if (!funcionarioExistente) {
      return res.status(400).json({ mensagem: 'Matrícula do funcionário não encontrada' })
    }

    // garantir que o funcionario possua escala antes de buscar turnos
    if (!funcionarioExistente.id_escala) {
      return res.status(400).json({
        mensagem: 'Funcionário não possui escala vinculada. Cadastre uma escala antes de adicionar um turno.'
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
      .select("*")
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
      return res.status(400).json({ mensagem: "Erro ao vincular turno ao funcionário!", erro: errorVinculo })
    }

    res.status(201).json({
      mensagem: 'Turno cadastrado e vinculado com sucesso',
      turno: turnoCriado,
      funcionario: turnoVinculado
    })

  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
  }
})


export default route
