const express = require('express'); 
const mongoose = require('mongoose'); // Importar a biblioteca mongoose
const { v4: uuidv4 } = require('uuid'); // Importar a biblioteca uuid
const jwt = require('jsonwebtoken'); // Importar a biblioteca jsonwebtoken
const bcrypt = require('bcryptjs'); // Importar a biblioteca bcryptjs
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const SECRET_KEY = process.env.SECRET_KEY;
const port = process.env.PORT || 3000;

app.use(cors({origin: '*'}));
app.use(express.json());

// Conectar ao MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Conectado ao MongoDB Atlas');
  })
  .catch((error) => {
    console.error('Erro ao conectar ao MongoDB Atlas:', error);
  });

// Definir o modelo de Usuário
const UserSchema = new mongoose.Schema({
  email: String,
  password: String
});
const User = mongoose.model('User', UserSchema);

// Middleware para verificar o token JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'Acesso negado' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    req.user = user;
    next();
  });
};

// Rota para fazer login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email ou senha incorretos' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Email ou senha incorretos' });

    const token = jwt.sign({ id: user._id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

// Rota para registrar um novo usuário
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
  try {
    await user.save();
    res.status(201).json({ message: 'Usuário registrado com sucesso!' });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({ message: 'Erro ao registrar usuário' });
  }
});

// Definir o modelo de Agendamento
const AgendamentoSchema = new mongoose.Schema({
  nome: String,
  telefone: String,
  title: String,
  dia: String,
  horario: String,
  start: String,
  uuid: String,
  status: String,
  servico: String
});
const Agendamento = mongoose.model('Agendamento', AgendamentoSchema);

// Definir o modelo de BlockDay
const BlockDaySchema = new mongoose.Schema({
  dia: String,
  block: Boolean
});
const BlockDay = mongoose.model('BlockDay', BlockDaySchema);

app.get('/', (req, res) => {
  res.json({ message: 'Hello Backend!' });
});

// Rota para obter serviços
app.get('/servicos', (req, res) => {
  const servicos = [
    { id: 1, nome: "Cabelo", preco: 100 },
    { id: 2, nome: "Barba", preco: 200 },
    { id: 3, nome: "Completo", preco: 250 }
  ];
  res.json(servicos);
});

// Rota para obter horários disponíveis com base no dia
app.get('/horarios', async (req, res) => {
  const { dia } = req.query;

  // Valida o formato da data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return res.status(400).json({ message: "Formato de data inválido. Use YYYY-MM-DD." });
  }

  try {
    const agora = new Date();
    const dataAtual = agora.toISOString().split('T')[0]; // Obtém a data atual no formato YYYY-MM-DD
    const horaAtual = agora.getUTCHours() - 3; // pega a hora atual em UTC
    if (horaAtual < 0) horaAtual = 24 + horaAtual; // ajusta a hora para o fuso horário
    const minutoAtual = agora.getUTCMinutes(); // pega os minutos atuais em UTC

    // Verifica se o dia solicitado é anterior ao dia atual
    if (dia < dataAtual) {
      return res.status(400).json({ message: "Não é possível agendar em dias anteriores à data atual." });
    }

    console.log(`[DEBUG] Hora atual UTC: ${horaAtual}:${minutoAtual} - Data atual: ${dataAtual} - Dia requisitado: ${dia}`);

    // Verifica se o dia está bloqueado
    const blockDay = await BlockDay.findOne({ dia });

    if (blockDay?.block) {
      return res.status(403).json({ message: "Dia indisponível" });
    }

    const todosHorarios = [
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", 
      "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
    ];

    // Obtém os agendamentos para o dia informado
    const agendamentos = await Agendamento.find({ dia });

    // Extrai os horários ocupados
    const horariosOcupados = new Set(agendamentos.map(agendamento => agendamento.horario));

    // Filtra os horários disponíveis
    const horariosDisponiveis = todosHorarios.filter(horario => {
      const [hora, minuto] = horario.split(':').map(Number);

        // aqui tambem vamos calcular a hora em UTC
      const horarioPassou = dia === dataAtual && (hora < horaAtual || (hora === horaAtual && minuto <= minutoAtual));

      return !horarioPassou && !horariosOcupados.has(horario);
    });

    console.log(`Horários disponíveis para ${dia}:`, horariosDisponiveis);

    res.json(horariosDisponiveis);
  } catch (error) {
    console.error('[ERROR] Erro ao obter horários disponíveis:', error);
    res.status(500).json({ message: 'Erro ao obter horários disponíveis' });
  }
});

// Rota para verificar se um dia está bloqueado
app.post('/blockday', async (req, res) => {
  const { dia } = req.body;

  if (!dia) {
    return res.status(400).json({ message: 'Parâmetro "dia" é obrigatório' });
  }

  try {
    const blockDay = await BlockDay.findOne({ dia });

    if (blockDay) {
      return res.json({ message: 'Este dia já está bloqueado.' });
    }

    const verificaAgendamentos = await Agendamento.findOne({ dia });

    if (verificaAgendamentos) {
      return res.json({ message: 'Não é possível bloquear este dia, pois já existem agendamentos.' });
    }

    const newBlockDay = new BlockDay({ dia, block: true });
    await newBlockDay.save();

    return res.json({ message: 'Dia bloqueado com sucesso!', blocked: true });

  } catch (error) {
    console.error('Erro ao bloquear o dia:', error);
    res.status(500).json({ message: 'Erro ao bloquear o dia' });
  }
});

// Rota para desbloquear um dia
app.get('/blockdaylist', async (req, res) => {
  try {
    const blockDays = await BlockDay.find();
    res.json(blockDays);
  } catch (error) {
    console.error('Erro ao obter dias bloqueados:', error);
    res.status(500).json({ message: 'Erro ao obter dias bloqueados' });
  }
});

// Rota para criar um novo agendamento
app.post('/agendamentos', async (req, res) => {
  const { dia, horario } = req.body;
  try {
    // Verificar se já existe um agendamento no mesmo horário para o mesmo dia
    const existingAgendamento = await Agendamento.findOne({ dia, horario });
    if (existingAgendamento) {
      return res.status(400).json({ message: 'Já existe um agendamento para este horário.' });
    }

    const agendamento = new Agendamento({
      ...req.body,
      id: undefined, // Remover o campo id
      uuid: req.body.uuid || uuidv4(), // Gera um UUID para o agendamento se não existir
      start: `${req.body.dia}T${req.body.horario}:00`, // Combine dia e horário
      status: "Agendado" // Define o status inicial como "Agendado"
    });

    await agendamento.save();
    console.log('Novo agendamento: ', agendamento);
    res.status(201).json({ message: 'Agendamento realizado com sucesso!', uuid: agendamento.uuid });
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ message: 'Erro ao criar agendamento' });
  }
});

// Rota para obter agendamentos
app.get('/agendamentos', async (req, res) => {
  try {
    const agendamentos = await Agendamento.find();
    res.json(agendamentos);
  } catch (error) {
    console.error('Erro ao obter agendamentos:', error);
    res.status(500).json({ message: 'Erro ao obter agendamentos' });
  }
});

// Rota para excluir todos os agendamentos com status "Realizado"
app.delete('/agendamentos/realizados', async (req, res) => {
  console.log('Excluindo agendamentos realizados...');
  try {
    const result = await Agendamento.deleteMany({ status: "Realizado" });
    console.log(`Agendamentos excluídos: ${result.deletedCount}`);
    res.status(200).json({ message: 'Todos os agendamentos realizados foram excluídos com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir agendamentos realizados:', error);
    res.status(500).json({ message: 'Erro ao excluir agendamentos realizados' });
  }
});

// Rota para excluir um agendamento pelo ID
app.delete('/agendamentos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await Agendamento.findByIdAndDelete(id);
    res.status(200).json({ message: 'Agendamento excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir agendamento:', error);
    res.status(500).json({ message: 'Erro ao excluir agendamento' });
  }
});

// Rota para alterar o status de um agendamento pelo ID
app.put('/agendamentos/:id/status', async (req, res) => {
  const { id } = req.params;
  try {
    const agendamento = await Agendamento.findById(id);
    if (agendamento) {
      agendamento.status = "Realizado";
      await agendamento.save();
      console.log('Agendamento realizado: ', agendamento);
      res.status(200).json({ message: 'Status do agendamento alterado para Realizado!' });
    } else {
      res.status(404).json({ message: 'Agendamento não encontrado!' });
    }
  } catch (error) {
    console.error('Erro ao alterar status do agendamento:', error);
    res.status(500).json({ message: 'Erro ao alterar status do agendamento' });
  }
});

//Rota para excluir um dia bloqueado
app.delete('/blockday/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await BlockDay.findByIdAndDelete(id);
    res.status(200).json({ message: 'Dia bloqueado excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir dia bloqueado:', error);
    res.status(500).json({ message: 'Erro ao excluir dia bloqueado' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

