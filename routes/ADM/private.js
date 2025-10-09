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

        // buscar equipes que possuem funcionários no setor
        const { data: equipes, error } = await supabase
            .from('funcionario')
            .select('id_equipe, equipe:equipe(nome_equipe)')
            .eq('id_setor', adm.id_setor)
            .not('id_equipe', 'is', null)

        if (error) {    
            return res.status(400).json({ mensagem: 'Erro ao buscar equipes', erro: error })
        }

        // Remover duplicatas e formatar resultado
        const equipesUnicas = []
        const nomesVistos = new Set()
        for (const f of equipes) {
            if (f.equipe && f.equipe.nome_equipe && !nomesVistos.has(f.equipe.nome_equipe)) {
                equipesUnicas.push({
                    id_equipe: f.id_equipe,
                    nome_equipe: f.equipe.nome_equipe
                })
                nomesVistos.add(f.equipe.nome_equipe)
            }
        }

        res.status(200).json(equipesUnicas)

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
            .select(`matricula_funcionario, nome,
            escala(id_escala, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala, dias_n_trabalhados_escala_semanal)`)
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
            return res.status(400).json({ mensagem: 'Erro ao buscar funcionários do setor', erro: errorFuncionarios })
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
            .select(`
                matricula_funcionario,
                nome,
                escala_confirmacao:escala_confirmacao!escala_confirmacao_matricula_funcionario_fkey(
                    id_confirmacao,
                    id_escala,
                    data_confirmacao,
                    status
                ),
                escala(id_escala, data_inicio, tipo_escala)
            `)
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
            return res.status(400).json({ mensagem: 'Data é obrigatória no formato DD/MM/YYYY ou YYYY-MM-DD' })
        }

        // aceitar formato DD/MM/YYYY convertendo para ISO YYYY-MM-DD
        if (typeof dataConsulta === 'string' && dataConsulta.includes('/')) {
            const partes = dataConsulta.split('/')
            if (partes.length !== 3) {
                return res.status(400).json({ mensagem: 'Formato de data inválido. Use DD/MM/YYYY ou YYYY-MM-DD.' })
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
            .select(`
                matricula_funcionario, nome, id_escala,
                escala(id_escala, data_inicio, dias_trabalhados, dias_n_trabalhados, tipo_escala, dias_n_trabalhados_escala_semanal)
            `)
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

        let equipeId
        //encontrar equipe pelo nome
        const { data: equipeExistente } = await supabase
            .from('equipe')
            .select('id_equipe')
            .eq('nome_equipe', nome_equipe)
            .maybeSingle()

        if(!equipeExistente) {
            return res.status(400).json({ mensagem: 'Equipe não encontrada. Cadastre a equipe antes de vincular ao funcionário.' })
        }

        let regiaoId
        // encontrar regiao pelo nome
        const { data: regiaoExistente } = await supabase
            .from('regiao')
            .select('id_regiao')
            .eq('nome_regiao', nome_regiao)
            .maybeSingle()

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


// editar informacoes do funcionario do setor do adm

// Cadastrar escala e vincular ao funcionário
route.post('/cadastrarEscala', async (req, res) => {
    const obrigatorios = [
        'matricula_adm',
        'matricula_funcionario',
        'data_inicio',
        'tipo_escala'
    ]

    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) {
        return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    try {
        const {
            matricula_adm,
            matricula_funcionario,
            data_inicio,
            tipo_escala,
            dias_n_trabalhados_escala_semanal,
            usa_dias_especificos
        } = req.body

        // Interpreta a escala no formato "NxM"
        const interpretarEscala = (tipo) => {
            const padrao = /^(\d{1,2})x(\d{1,2})$/
            const match = tipo.match(padrao)
            if (!match) return null

            let n = parseInt(match[1], 10)
            let m = parseInt(match[2], 10)

            // Se a soma exceder 7, assume que são horas e converte para dias
            if ((n + m) > 7) {
                n = Math.ceil(n / 24)
                m = Math.ceil(m / 24)
            }

            return { dias_trabalhados: n, dias_n_trabalhados: m }
        }

        const escalaInfo = interpretarEscala(tipo_escala)
        if (!escalaInfo) {
            return res.status(400).json({ mensagem: 'Tipo de escala inválido. Use o formato "6x1", "12x36", etc.' })
        }

        const { dias_trabalhados, dias_n_trabalhados } = escalaInfo
        const precisa_dias_especificos = usa_dias_especificos === true

        // Se a escala exige dias específicos, validar o campo enviado
        if (precisa_dias_especificos) {
            if ( 
                !dias_n_trabalhados_escala_semanal ||
                !Array.isArray(dias_n_trabalhados_escala_semanal) ||
                dias_n_trabalhados_escala_semanal.length === 0
            ) {
                return res.status(400).json({
                    mensagem: 'Escala exige dias de folga específicos. Informe "dias_n_trabalhados_escala_semanal" como array.'
                })
            }

            const diasValidos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
            const diasInvalidos = dias_n_trabalhados_escala_semanal.filter(d => !diasValidos.includes(d))

            if (diasInvalidos.length > 0) {
                return res.status(400).json({
                    mensagem: `Os seguintes dias são inválidos: ${diasInvalidos.join(', ')}`,
                    dias_validos: diasValidos
                })
            }
        }

        // verificar se os dias especificos se igualam a quantidade de dias não trabalhados
        // mapear a quantidade de dias em dias_n_trabalhados_semanal
        if (precisa_dias_especificos) {
            const diasMapeados = {
                'Dom': 0,
                'Seg': 1,
                'Ter': 2,
                'Qua': 3,
                'Qui': 4,                   
                'Sex': 5,
                'Sab': 6
            }
            const diasUnicos = [...new Set(dias_n_trabalhados_escala_semanal)]
            const quantidadeDias = diasUnicos.length

            if (quantidadeDias !== dias_n_trabalhados) {
                return res.status(400).json({
                    mensagem: `A quantidade de dias não trabalhados (${dias_n_trabalhados}) não corresponde à quantidade de dias específicos fornecidos (${quantidadeDias}).`,
                    detalhes: 'Verifique os dias específicos e ajuste conforme necessário.'
                })
            }
        }

        // Verificar se o funcionário existe
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

        // Verificar setor do ADM
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

        // Verificar se já possui escala
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
            .insert([{
                data_inicio,
                tipo_escala,
                dias_trabalhados,
                dias_n_trabalhados,
                dias_n_trabalhados_escala_semanal: precisa_dias_especificos ? dias_n_trabalhados_escala_semanal : null
            }])
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

        // Criar confirmação de leitura da escala
        const { data: primeiraConfirmacao } = await supabase
            .from('escala_confirmacao')
            .insert([{
                matricula_funcionario: funcionarioExistente.matricula_funcionario,
                id_escala: escalaCriada.id_escala
            }])
            .select('*')
            .single()

        if (!primeiraConfirmacao) {
            return res.status(400).json({ mensagem: 'Erro ao criar confirmação de leitura da escala' })
        }
    } catch (error) {
        return res.status(500).json({ mensagem: 'Erro no servidor', erro: error.message })
    }

    return res.status(201).json({ mensagem: 'Escala cadastrada e vinculada com sucesso' })
})

// rota para alterar uma escala existente
route.put('/alterarEscala', async (req, res) => {
    const obrigatorios = [
        'matricula_adm',
        'matricula_funcionario',
        'data_inicio',
        'tipo_escala'
    ]
    const campoFaltando = validarCampos(obrigatorios, req.body)
    if (campoFaltando) {
        return res.status(400).json({ mensagem: `Preencha o campo obrigatório: ${campoFaltando}` })
    }

    try {
        const {
            matricula_adm,
            matricula_funcionario,
            data_inicio,
            tipo_escala,
            dias_n_trabalhados_escala_semanal,
            usa_dias_especificos
        } = req.body

        // Interpreta a escala no formato "NxM"
        const interpretarEscala = (tipo) => {
            const padrao = /^(\d{1,2})x(\d{1,2})$/
            const match = tipo.match(padrao)
            if (!match) return null

            let n = parseInt(match[1], 10)
            let m = parseInt(match[2], 10)

            // Se a soma exceder 7, assume que são horas e converte para dias
            if ((n + m) > 7) {
                n = Math.ceil(n / 24)
                m = Math.ceil(m / 24)
            }

            return { dias_trabalhados: n, dias_n_trabalhados: m }
        }

        const escalaInfo = interpretarEscala(tipo_escala)
        if (!escalaInfo) {
            return res.status(400).json({ mensagem: 'Tipo de escala inválido. Use o formato "6x1", "12x36", etc.' })
        }

        const { dias_trabalhados, dias_n_trabalhados } = escalaInfo
        const precisa_dias_especificos = usa_dias_especificos === true

        // Se a escala exige dias específicos, validar o campo enviado
        if (precisa_dias_especificos) {
            if ( 
                !dias_n_trabalhados_escala_semanal ||
                !Array.isArray(dias_n_trabalhados_escala_semanal) ||
                dias_n_trabalhados_escala_semanal.length === 0
            ) {
                return res.status(400).json({
                    mensagem: 'Escala exige dias de folga específicos. Informe "dias_n_trabalhados_escala_semanal" como array.'
                })
            }

            const diasValidos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
            const diasInvalidos = dias_n_trabalhados_escala_semanal.filter(d => !diasValidos.includes(d))

            if (diasInvalidos.length > 0) {
                return res.status(400).json({
                    mensagem: `Os seguintes dias são inválidos: ${diasInvalidos.join(', ')}`,
                    dias_validos: diasValidos
                })
            }
        }

        // verificar se os dias especificos se igualam a quantidade de dias não trabalhados
        // mapear a quantidade de dias em dias_n_trabalhados_semanal
        if (precisa_dias_especificos) {
            const diasMapeados = {
                'Dom': 0,
                'Seg': 1,
                'Ter': 2,
                'Qua': 3,
                'Qui': 4,                   
                'Sex': 5,
                'Sab': 6
            }
            const diasUnicos = [...new Set(dias_n_trabalhados_escala_semanal)]
            const quantidadeDias = diasUnicos.length

            if (quantidadeDias !== dias_n_trabalhados) {
                return res.status(400).json({
                    mensagem: `A quantidade de dias não trabalhados (${dias_n_trabalhados}) não corresponde à quantidade de dias específicos fornecidos (${quantidadeDias}).`,
                    detalhes: 'Verifique os dias específicos e ajuste conforme necessário.'
                })
            }
        }

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
            .update({
                data_inicio,
                tipo_escala,
                dias_trabalhados,
                dias_n_trabalhados,
                dias_n_trabalhados_escala_semanal: precisa_dias_especificos ? dias_n_trabalhados_escala_semanal : null
            })
            .eq('id_escala', funcionarioExistente.id_escala)
            .select()
            .single()

        if (errorEscala) {
            return res.status(400).json({ mensagem: 'Erro ao alterar escala', erro: errorEscala })
        }

        // gerar nova confirmação de leitura da escala
        const { data: escalaConfirmacao } = await supabase
            .from('escala_confirmacao')
            .insert({
                matricula_funcionario: funcionarioExistente.matricula_funcionario,
                id_escala: escalaAtualizada.id_escala,
                data_confirmacao: null
            })
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
