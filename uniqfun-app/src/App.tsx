import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Coins from './pages/Coins'
import CoinPage from './pages/CoinPage'
import Launch from './pages/Launch'
import Bridge from './pages/Bridge'
import Uniq from './pages/Uniq'
import UsernamePage from './pages/Username'
import UserProfilePage, { UsersDirectoryPage } from './pages/UserProfile'
import Rewards from './pages/Rewards'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/coins" element={<Coins />} />
        <Route path="/coin/:ticker" element={<CoinPage />} />
        <Route path="/launch" element={<Launch />} />
        <Route path="/bridge" element={<Bridge />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/uniq" element={<Uniq />} />
        <Route path="/users" element={<UsersDirectoryPage />} />
        <Route path="/u" element={<UsersDirectoryPage />} />
        <Route path="/u/:username" element={<UserProfilePage />} />
        <Route path="/user/:username" element={<UserProfilePage />} />
        <Route path="/profile/:username" element={<UserProfilePage />} />
        <Route path="/pass" element={<UsernamePage />} />
        <Route path="/username" element={<Navigate to="/pass" replace />} />
        <Route path="/board" element={<Navigate to="/coins" replace />} />
        <Route path="/token" element={<Navigate to="/uniq" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}
