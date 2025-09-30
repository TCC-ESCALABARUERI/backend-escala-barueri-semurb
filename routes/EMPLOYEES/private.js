import express from 'express'
import supabase from '../../supabase.js'
import bcrypt from 'bcrypt'

const route = express.Router()

// confirmação de leitura da escala
route.put('/confirmacaoEscala/:matricula_funcionario', async (req, res) => {
  const { matricula_funcionario } = req.params

  try {
    // Buscar a confirmação mais recente
    const { data: ultimaConfirmacao, error: erroBusca } = await supabase
      .from('escala_confirmacao')
      .select('*')
      .eq('matricula_funcionario', matricula_funcionario)
      .order('data_confirmacao', { ascending: false }) // pega a mais recente
      .limit(1)

    if (erroBusca) {
      return res.status(500).json({ message: 'Erro ao buscar confirmação.', error: erroBusca.message })
    }

    if (ultimaConfirmacao && ultimaConfirmacao.length > 0) {
      const confirmacao = ultimaConfirmacao[0]

      if (confirmacao.status === 'Confirmado') {
        return res.status(400).json({ message: 'A escala mais recente já foi confirmada.' })
      }

      // Atualizar somente a mais recente
      const { data: confirmada, error: erroUpdate } = await supabase
        .from('escala_confirmacao')
        .update({
          status: 'Confirmado',
          data_confirmacao: new Date().toISOString()
        })
        .eq('id_confirmacao', confirmacao.id_confirmacao) // atualiza só a última
        .select()
        .single()

      if (erroUpdate) {
        return res.status(500).json({ message: 'Erro ao confirmar escala.', error: erroUpdate.message })
      }

      return res.status(200).json({ message: 'Escala confirmada com sucesso.', confirmada })
    }

    return res.status(404).json({ message: 'Nenhuma escala encontrada para esse funcionário.' })
  } catch (error) {
    res.status(500).json({ message: 'Erro ao confirmar escala.', error: error.message })
  }
})


// alteração de senha

route.put('/alterarSenha', async (req, res) => {
    const { matricula_funcionario, nova_senha } = req.body;

    try {
        // validação de entrada
        if (!matricula_funcionario || !nova_senha) {
            return res.status(400).json({ message: 'Matrícula e nova senha são obrigatórias.' });
        }

        // gerar hash da nova senha
        const saltRounds = parseInt(process.env.SALT_ROUNDS) || 10;
        const hashedPassword = await bcrypt.hash(nova_senha, saltRounds);

        // atualizar a senha no banco de dados   
        const { data, error } = await supabase
            .from('funcionario')
            .update({ senha: hashedPassword })
            .eq('matricula_funcionario', matricula_funcionario)
            .select('matricula_funcionario, nome') // não retorna senha

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ message: 'Funcionário não encontrado.' })
        }

        res.status(200).json({ message: 'Senha alterada com sucesso.', funcionario: data[0] })
    } catch (error) {
        res.status(500).json({ message: 'Erro ao alterar senha.', error: error.message })
    }
})


export default route