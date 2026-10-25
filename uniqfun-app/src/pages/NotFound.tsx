import { Link } from 'react-router-dom'
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="font-display text-4xl">Page not found</h1>
      <Link to="/" className="btn-primary mt-6">Go home</Link>
    </div>
  )
}
